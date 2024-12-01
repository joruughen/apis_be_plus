
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB Client
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const stage = process.env.STAGE || 'dev';  // Ensure the stage variable is set
    const tableName = `${stage}_purchasables`;  // Dynamically determine the table name
    const { id } = event.pathParameters || {};  // Extract the item ID from path parameters

    // Validate input
    if (!id) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: '"id" is required in the path parameters.',
            }),
        };
    }

    const params = {
        TableName: tableName,
        Key: { id },
    };

    try {
        // Fetch the item from the DynamoDB table
        const data = await docClient.send(new GetCommand(params));

        if (!data.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `Item with id "${id}" not found.`,
                }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Item retrieved successfully',
                item: data.Item,
            }),
        };
    } catch (error) {
        console.error('Error fetching item from DynamoDB:', error.message || error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                details: error.message || 'An error occurred while retrieving the item.',
            }),
        };
    }
};
