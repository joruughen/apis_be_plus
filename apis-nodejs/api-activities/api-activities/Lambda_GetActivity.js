const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const lambdaClient = new LambdaClient({});

const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;
const VALIDATE_FUNCTION_NAME = process.env.VALIDATE_FUNCTION_NAME;

exports.handler = async (event) => {
    try {
        console.log("Received event:", JSON.stringify(event));

        // Validate Authorization token
        const token = event.headers['Authorization'];
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing Authorization token' })
            };
        }

        console.log("Validating token...");
        const validateResponse = await lambdaClient.send(new InvokeCommand({
            FunctionName: VALIDATE_FUNCTION_NAME,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({ token })
        }));

        const validatePayload = JSON.parse(Buffer.from(validateResponse.Payload).toString());
        if (validatePayload.statusCode === 403) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Unauthorized Access' })
            };
        }

        const { tenant_id, student_id } = validatePayload.body; // Extraer tenant_id y student_id del token
        console.log("Token validated successfully. Tenant ID:", tenant_id, "Student ID:", student_id);

        // Parse query parameters
        const { queryType, activity_id, activity_type, limit = 10, lastEvaluatedKey } = event.queryStringParameters || {};

        if (!queryType) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'queryType is required' })
            };
        }

        let params = {
            TableName: ACTIVITIES_TABLE,
            Limit: parseInt(limit),
            ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
        };

        switch (queryType) {
            case 'PRIMARY_KEY':
                if (!activity_id) {
                    return {
                        statusCode: 400,
                        body: JSON.stringify({ error: 'activity_id is required for PRIMARY_KEY query' })
                    };
                }
                params.Key = { tenant_id, activity_id };
                const getResult = await docClient.send(new GetCommand(params));
                return {
                    statusCode: 200,
                    body: JSON.stringify({ item: getResult.Item })
                };

            case 'GSI':
                params.IndexName = 'student_id_index';
                params.KeyConditionExpression = 'student_id = :student_id';
                params.ExpressionAttributeValues = { ':student_id': student_id };
                const gsiResult = await docClient.send(new QueryCommand(params));
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        items: gsiResult.Items,
                        lastEvaluatedKey: gsiResult.LastEvaluatedKey
                    })
                };

            case 'LSI':
                if (!activity_type) {
                    return {
                        statusCode: 400,
                        body: JSON.stringify({ error: 'activity_type is required for LSI query' })
                    };
                }
                params.IndexName = 'activity_type_index';
                params.KeyConditionExpression = 'tenant_id = :tenant_id AND activity_type = :activity_type';
                params.ExpressionAttributeValues = {
                    ':tenant_id': tenant_id,
                    ':activity_type': activity_type
                };
                const lsiResult = await docClient.send(new QueryCommand(params));
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        items: lsiResult.Items,
                        lastEvaluatedKey: lsiResult.LastEvaluatedKey
                    })
                };

            default:
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Invalid queryType' })
                };
        }
    } catch (error) {
        console.error("Error occurred:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};
