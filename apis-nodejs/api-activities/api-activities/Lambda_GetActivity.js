const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;
const TOKENS_TABLE = `${process.env.STAGE}_t_access_tokens`;
const VALIDATE_FUNCTION_NAME = process.env.VALIDATE_FUNCTION_NAME;

exports.handler = async (event) => {
    console.log('Event received:', event);

    try {
        const token = event.headers['Authorization'];
        if (!token) {
            return {
                statusCode: 400,
                body: { error: 'Missing Authorization token' }
            };
        }

        // Validar el token usando la función Lambda ValidateAccessToken
        const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME;
        if (!validateFunctionName) {
            return {
                statusCode: 500,
                body: { error: 'ValidateAccessToken function not configured' }
            };
        }

        const validateResponse = await lambdaClient.send(new InvokeCommand({
            FunctionName: validateFunctionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({ token })
        }));

        const validatePayload = JSON.parse(Buffer.from(validateResponse.Payload).toString());
        if (validatePayload.statusCode === 403) {
            return {
                statusCode: 403,
                body: { error: validatePayload.body || 'Unauthorized Access' }
            };
        }

        // Recuperar tenant_id y student_id desde el token (puedes extraerlos aquí si son parte de la validación)
        const tokenItem = await docClient.send(new GetCommand({
            TableName: TOKENS_TABLE,
            Key: { token },
        }));

        if (!tokenItem.Item) {
            return {
                statusCode: 403,
                body: { error: 'Invalid or expired token' }
            };
        }

        // Extraer queryStringParameters
        const query = event.query || {};  // Asumimos que el query ya está parseado en el yml
        const { method, limit ,lastEvaluatedKey, activity_type, activity_id} = query;

        // Validar el método, si no existe uno, poner un valor predeterminado (ej. "primaryKey")
        const queryMethod = method || 'primaryKey';  // Si no hay método, usar primaryKey por defecto
        const queryLimit = limit ? parseInt(limit, 10) : 10;  // Poner un límite predeterminado si no existe
        console.log(`Query parameters: method=${queryMethod}, limit=${queryLimit}, lastEvaluatedKey=${lastEvaluatedKey}`);

        // Ejecutar la consulta en DynamoDB según el método
        let result;

        if (queryMethod === 'gsi') {
            // Verificar si se proporciona activity_id
            const keyConditions = activity_id
                ? 'student_id = :studentId AND activity_id = :activityId'
                : 'student_id = :studentId';

            const expressionAttributeValues = activity_id
                ? {
                    ':studentId': tokenItem.Item.student_id,
                    ':activityId': activity_id
                }
                : {
                    ':studentId': tokenItem.Item.student_id
                };

            // Ejecutar la consulta con GSI (usando 'student_id_index')
            result = await docClient.send(new QueryCommand({
                TableName: ACTIVITIES_TABLE,
                IndexName: 'student_id_index',  // Nombre del GSI
                KeyConditionExpression: keyConditions,
                ExpressionAttributeValues: expressionAttributeValues,
                Limit: queryLimit,
                ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
            }));
        } else if (queryMethod === 'lsi') {
            // Ejecutar la consulta con LSI (usando 'activity_type_index')
            result = await docClient.send(new QueryCommand({
                TableName: ACTIVITIES_TABLE,
                IndexName: 'activity_type_index',  // Nombre del LSI
                KeyConditionExpression: 'tenant_id = :tenantId and activity_type = :activityType',  // Filtramos por tenant_id y activity_type
                ExpressionAttributeValues: {
                    ':tenantId': tokenItem.Item.tenant_id,
                    ':activityType': activity_type
                },
                Limit: queryLimit,
                ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
            }));
        } else {
            // Ejecutar la consulta por Primary Key (usando 'tenant_id' y 'activity_id')
            result = await docClient.send(new QueryCommand({
                TableName: ACTIVITIES_TABLE,
                KeyConditionExpression: 'tenant_id = :tenantId',  // Filtramos por tenant_id y activity_id
                ExpressionAttributeValues: {
                    ':tenantId': tokenItem.Item.tenant_id
                },
                Limit: queryLimit,
                ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
            }));
        }



        // Devolver la respuesta con los resultados obtenidos
        return {
            statusCode: 200,
            body: {
                items: result.Items,
                lastEvaluatedKey: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : null
            }
        };

    } catch (error) {
        console.error('Error processing request:', error);
        return {
            statusCode: 500,
            body: { error: 'Internal Server Error' }
        };
    }
};
