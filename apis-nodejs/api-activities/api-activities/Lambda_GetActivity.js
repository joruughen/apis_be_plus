const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');  // Asegúrate de importar InvokeCommand correctamente
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;
const TOKENS_TABLE = `${process.env.STAGE}_t_access_tokens`;
const VALIDATE_FUNCTION_NAME = process.env.VALIDATE_FUNCTION_NAME;  // Función para validar el token

exports.handler = async (event, context) => {
    try {
        // Obtener el token de autorización desde los headers
        const token = event.headers['Authorization'];
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing Authorization token' })
            };
        }

        // Validar el token usando la función Lambda ValidateAccessToken
        if (!VALIDATE_FUNCTION_NAME) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'ValidateAccessToken function not configured' })
            };
        }

        const validateResponse = await lambdaClient.send(new InvokeCommand({
            FunctionName: VALIDATE_FUNCTION_NAME,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({ token })
        }));

        const validatePayload = JSON.parse(Buffer.from(validateResponse.Payload).toString());
        if (validatePayload.statusCode === 403) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: validatePayload.body || 'Unauthorized Access' })
            };
        }

        // Recuperar tenant_id y student_id desde el token
        const tokenItem = await docClient.send(new GetCommand({
            TableName: TOKENS_TABLE,
            Key: { token }
        }));

        if (!tokenItem.Item) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to retrieve tenant_id and student_id from token' })
            };
        }

        const tenantId = tokenItem.Item.tenant_id;
        const studentId = tokenItem.Item.student_id;

        if (!tenantId || !studentId) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Missing tenant_id or student_id in token' })
            };
        }

        // Acceder al body de la solicitud
        const body = JSON.parse(event.body || '{}');
        const { limit = 10, lastEvaluatedKey } = body;

        // Extraer los filtros que se pasan en el body (pueden ser campos dinámicos)
        const filterKeys = Object.keys(body).filter(key => key !== 'limit' && key !== 'lastEvaluatedKey');
        let filterExpression = [];
        let expressionAttributeValues = {};
        let indexName = null;

        // Construir la expresión de filtro dinámicamente
        filterKeys.forEach(key => {
            filterExpression.push(`${key} = :${key}`);
            expressionAttributeValues[`:${key}`] = body[key];

            // Determinar el índice a utilizar
            if (key === 'student_id') {
                indexName = 'student_id_index';  // Usar el índice de `student_id`
            } else if (key === 'activity_type') {
                indexName = 'activity_type_index';  // Usar el índice de `activity_type`
            }
        });

        // Definir los parámetros de la consulta
        const params = {
            TableName: ACTIVITIES_TABLE,
            FilterExpression: filterExpression.length ? filterExpression.join(' AND ') : undefined,
            ExpressionAttributeValues: expressionAttributeValues,
            Limit: parseInt(limit),  // Limitar la cantidad de elementos retornados
            ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined, // Paginación
        };

        // Si se definió un índice secundario, utilizarlo
        if (indexName) {
            params.IndexName = indexName;
        }

        // Ejecutar la consulta
        const data = await docClient.send(new QueryCommand(params));

        // Responder con los resultados y el nextKey si hay más resultados
        return {
            statusCode: 200,
            body: JSON.stringify({
                items: data.Items,
                nextKey: data.LastEvaluatedKey ? JSON.stringify(data.LastEvaluatedKey) : null
            })
        };

    } catch (error) {
        console.error('Error occurred:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
