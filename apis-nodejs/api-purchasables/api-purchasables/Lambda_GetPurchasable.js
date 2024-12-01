const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PURCHASABLES_TABLE = `${process.env.STAGE}_t_purchasable`;  // Changed to reflect purchasable items
const TOKENS_TABLE = `${process.env.STAGE}_t_access_tokens`;
const VALIDATE_FUNCTION_NAME = process.env.VALIDATE_FUNCTION_NAME;

exports.handler = async (event) => {
    console.log('Event received:', event);

    try {
        // Step 1: Validate the Authorization Token
        const token = event.headers['Authorization'];
        if (!token) {
            return {
                statusCode: 400,
                body: { error: 'Missing Authorization token' }
            };
        }

        // Validate the token using the ValidateAccessToken Lambda function
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

        // Step 2: Retrieve tenant_id and user_id from the token
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

        // Step 3: Extract queryStringParameters
        const query = event.query || {};  // Assuming query is parsed correctly
        const { method, limit, lastEvaluatedKey, store_type, product_id, price } = query;

        // Default method is 'primaryKey' if not provided, and set a limit for pagination
        const queryMethod = method || 'primaryKey';
        const queryLimit = limit ? parseInt(limit, 10) : 10;
        console.log(`Query parameters: method=${queryMethod}, limit=${queryLimit}, lastEvaluatedKey=${lastEvaluatedKey}`);

        // Step 4: Execute the query based on the selected method (GSI, LSI, or Primary Key)
        let result;

        if (queryMethod === 'gsi') {
            // If store_type is provided, filter by it and product_id
            const keyConditions = product_id
                ? 'store_type = :storeType AND product_id = :productId'
                : 'store_type = :storeType';

            const expressionAttributeValues = product_id
                ? {
                    ':storeType': store_type,
                    ':productId': product_id
                }
                : {
                    ':storeType': store_type
                };

            // Execute the query using GSI (store_type_index)
            result = await docClient.send(new QueryCommand({
                TableName: PURCHASABLES_TABLE,
                IndexName: 'store_type_index_2',  // Using the GSI
                KeyConditionExpression: keyConditions,
                ExpressionAttributeValues: expressionAttributeValues,
                Limit: queryLimit,
                ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
            }));
        } else if (queryMethod === 'lsi') {
            // If price is provided, filter by it
            const expressionAttributeValues = {
                ':tenantId': tokenItem.Item.tenant_id,
                ':price': price
            };

            // Execute the query using LSI (price_index)
            result = await docClient.send(new QueryCommand({
                TableName: PURCHASABLES_TABLE,
                IndexName: 'price_index',  // Using the LSI
                KeyConditionExpression: 'tenant_id = :tenantId and price = :price',
                ExpressionAttributeValues: expressionAttributeValues,
                Limit: queryLimit,
                ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
            }));
        } else {
            // Execute the query by Primary Key (tenant_id + product_id)
            result = await docClient.send(new QueryCommand({
                TableName: PURCHASABLES_TABLE,
                KeyConditionExpression: 'tenant_id = :tenantId AND product_id = :productId',  // Primary Key query
                ExpressionAttributeValues: {
                    ':tenantId': tokenItem.Item.tenant_id,
                    ':productId': product_id
                },
                Limit: queryLimit,
                ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
            }));
        }

        // Step 5: Return the results
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
