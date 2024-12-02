const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PURCHASABLES_TABLE = `${process.env.STAGE}_t_purchasable`;
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
                body: JSON.stringify({ error: validatePayload.body || 'Unauthorized Access' })
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
                body: JSON.stringify({ error: 'Invalid or expired token' })
            };
        }

        // Step 3: Extract queryStringParameters
        const query = event.query || {};
        const { method, limit, lastEvaluatedKey, store_type, product_id, price } = query;

        const queryMethod = method || 'primaryKey';
        const queryLimit = limit ? parseInt(limit, 10) : 10;
        console.log(`Query parameters: method=${queryMethod}, limit=${queryLimit}, lastEvaluatedKey=${lastEvaluatedKey}`);

        // Step 4: Execute the query based on the selected method (GSI, LSI, or Primary Key)
        let result;

        if (queryMethod === 'gsi') {
            let keyConditionExpression = 'tenant_id = :tenantId';
            let expressionAttributeValues = {
                ':tenantId': tokenItem.Item.tenant_id
            };

            if (product_id) {
                keyConditionExpression += ' AND product_id = :productId';
                expressionAttributeValues[':productId'] = product_id;
            }

            let allItems = [];
            let lastEvaluatedKey = null;
            let fetchedItemsCount = 0;
            const storeType = store_type;

            // While there are more items to fetch
            while (fetchedItemsCount < queryLimit) {
                result = await docClient.send(new QueryCommand({
                    TableName: PURCHASABLES_TABLE,
                    KeyConditionExpression: keyConditionExpression,
                    ExpressionAttributeValues: expressionAttributeValues,
                    Limit: queryLimit - fetchedItemsCount,
                    ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
                }));

                if (result.Items) {
                    let filteredItems = result.Items.filter(item => item.store_type === storeType);
                    allItems = allItems.concat(filteredItems);
                    fetchedItemsCount = allItems.length;

                    // Handle pagination
                    if (result.LastEvaluatedKey) {
                        lastEvaluatedKey = JSON.stringify(result.LastEvaluatedKey);
                    } else {
                        break; // No more results, stop the loop
                    }
                } else {
                    break; // If no items are returned, exit the loop
                }
            }

            result.Items = allItems.slice(0, queryLimit); // Ensure we return only the desired number of items
            console.log('Filtered result:', result.Items);

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
            let keyConditionExpression = 'tenant_id = :tenantId';
            let expressionAttributeValues = {
                ':tenantId': tokenItem.Item.tenant_id
            };

            if (product_id) {
                keyConditionExpression += ' AND product_id = :productId';
                expressionAttributeValues[':productId'] = product_id;
            }

            // Execute the query
            result = await docClient.send(new QueryCommand({
                TableName: PURCHASABLES_TABLE,
                KeyConditionExpression: keyConditionExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                Limit: queryLimit,
                ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
            }));
        }

        // Step 5: Return the results
        return {
            statusCode: 200,
            body: {
                items: result.Items || [],
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
