const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;
const TOKENS_TABLE = `${process.env.STAGE}_t_access_tokens`;

exports.handler = async (event, context) => {
    try {
        // Obtener el token de autorización desde los headers
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

        // Recuperar tenant_id desde el token
        const tokenItem = await docClient.send(new GetCommand({
            TableName: TOKENS_TABLE,
            Key: { token }
        }));

        if (!tokenItem.Item) {
            return {
                statusCode: 500,
                body: { error: 'Failed to retrieve tenant_id from token' }
            };
        }

        const tenantId = tokenItem.Item.tenant_id;

        if (!tenantId) {
            return {
                statusCode: 500,
                body: { error: 'Missing tenant_id in token' }
            };
        }

        // Parámetros de paginación y filtrado
        const { limit = 10, lastEvaluatedKey, filters = {} } = event.queryStringParameters || {};

        let filterExpression = 'tenant_id = :tenant_id';
        let expressionAttributeValues = { ':tenant_id': tenantId };

        // Construir la expresión de filtrado dinámica
        Object.keys(filters).forEach((key) => {
            filterExpression += ` AND ${key} = :${key}`;
            expressionAttributeValues[`:${key}`] = filters[key];
        });

        const params = {
            TableName: ACTIVITIES_TABLE,
            KeyConditionExpression: filterExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            Limit: parseInt(limit), // Convertir a número para limitar los resultados
            ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
        };

        // Realizar la consulta en DynamoDB
        const queryResult = await docClient.send(new QueryCommand(params));

        // Devolver la respuesta con los resultados y la paginación
        return {
            statusCode: 200,
            body: JSON.stringify({
                activities: queryResult.Items,
                lastEvaluatedKey: queryResult.LastEvaluatedKey ? JSON.stringify(queryResult.LastEvaluatedKey) : null,
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
