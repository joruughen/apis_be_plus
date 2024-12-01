const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB Client
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const stage = process.env.STAGE || 'dev'; // Ensure the stage variable is set
    const tableName = `${stage}_purchasables`; // Dynamically determine the table name
    const { id } = event.pathParameters || {}; // Extract the `id` from path parameters

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
        Key: { id }, // Specify the item key for deletion
    };

    try {
        // Delete the item from the DynamoDB table
        await docClient.send(new DeleteCommand(params));

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Item with id "${id}" deleted successfully.`,
            }),
        };
    } catch (error) {
        console.error('Error deleting item from DynamoDB:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
            }),
        };
    }
};
