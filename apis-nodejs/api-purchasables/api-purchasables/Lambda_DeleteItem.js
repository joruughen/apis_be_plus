const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB Client
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const stage = process.env.STAGE || 'dev';  // Ensure the stage variable is set
    const tableName = `${stage}_purchasables`;  // Dynamically determine the table name
    const { id } = event.pathParameters || {};  // Extract the `id` from path parameters

    // Validate input
    if (!id) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: '"id" is required in the path parameters.',
            }),
        };
    }

    // Check if the item exists in the DynamoDB table
    const getParams = {
        TableName: tableName,
        Key: { id },  // The key to search the item
    };

    try {
        // Fetch the item to ensure it exists before attempting to delete
        const data = await docClient.send(new GetCommand(getParams));

        if (!data.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `Item with id "${id}" not found.`,
                }),
            };
        }

        // Proceed to delete the item
        const deleteParams = {
            TableName: tableName,
            Key: { id }, // Specify the item key for deletion
        };

        await docClient.send(new DeleteCommand(deleteParams));

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Item with id "${id}" deleted successfully.`,
            }),
        };
    } catch (error) {
        console.error('Error processing the request:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                details: error.message || 'An error occurred while deleting the item.',
            }),
        };
    }
};
