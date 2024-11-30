const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;
const TOKENS_TABLE = `${process.env.STAGE}_t_access_tokens`;
const VALIDATE_FUNCTION_NAME = process.env.VALIDATE_FUNCTION_NAME;

exports.handler = async (event, context) => {
    try {
        console.log("Received event: ", JSON.stringify(event));  // Agregado para depuración

        const token = event.headers['Authorization'];
        if (!token) {
            console.log("No token provided");  // Agregado para depuración
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing Authorization token' })
            };
        }

        console.log("Token provided: ", token);  // Agregado para depuración

        if (!VALIDATE_FUNCTION_NAME) {
            console.log("Validation function not configured");  // Agregado para depuración
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
        console.log("Validate response: ", validatePayload);  // Agregado para depuración

        if (validatePayload.statusCode === 403) {
            console.log("Unauthorized access attempt");  // Agregado para depuración
            return {
                statusCode: 403,
                body: JSON.stringify({ error: validatePayload.body || 'Unauthorized Access' })
            };
        }

        const tokenItem = await docClient.send(new GetCommand({
            TableName: TOKENS_TABLE,
            Key: { token }
        }));

        console.log("Token item from DynamoDB: ", tokenItem);  // Agregado para depuración

        if (!tokenItem.Item) {
            console.log("Failed to retrieve tenant_id and student_id from token");  // Agregado para depuración
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to retrieve tenant_id and student_id from token' })
            };
        }

        const tenantId = tokenItem.Item.tenant_id;
        const studentId = tokenItem.Item.student_id;

        if (!tenantId || !studentId) {
            console.log("Missing tenant_id or student_id in token");  // Agregado para depuración
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Missing tenant_id or student_id in token' })
            };
        }

        const body = JSON.parse(event.body || '{}');
        console.log("Parsed body: ", body);  // Agregado para depuración

        const { limit = 10, lastEvaluatedKey } = body;

        const filterKeys = Object.keys(body).filter(key => key !== 'limit' && key !== 'lastEvaluatedKey');
        let filterExpression = [];
        let expressionAttributeValues = {};
        let indexName = null;

        filterKeys.forEach(key => {
            filterExpression.push(`${key} = :${key}`);
            expressionAttributeValues[`:${key}`] = body[key];

            if (key === 'student_id') {
                indexName = 'student_id_index';
            } else if (key === 'activity_type') {
                indexName = 'activity_type_index';
            }
        });

        const params = {
            TableName: ACTIVITIES_TABLE,
            FilterExpression: filterExpression.length ? filterExpression.join(' AND ') : undefined,
            ExpressionAttributeValues: expressionAttributeValues,
            Limit: parseInt(limit),
            ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
        };

        if (indexName) {
            params.IndexName = indexName;
        }

        console.log("Query parameters: ", params);  // Agregado para depuración

        const data = await docClient.send(new QueryCommand(params));

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
