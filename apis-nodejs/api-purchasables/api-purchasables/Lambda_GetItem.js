const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB Client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const getItem = async (id, tableName) => {
    const params = {
        TableName: tableName,
        Key: { id },
    };

    try {
        // Fetch the item from DynamoDB
        const data = await docClient.send(new GetCommand(params));
        return data.Item; // Return the item if found
    } catch (error) {
        console.error(`Error fetching item with id ${id} from ${tableName}:`, error);
        throw error; // Rethrow to be caught in the handler
    }
};

exports.handler = async (event) => {
    const stage = process.env.STAGE || 'dev';  // Ensure the stage variable is set
    const tableName = `${stage}_purchasables`;  // Dynamically determine the table name

    // Extract item ID from path parameters
    const { id } = event.pathParameters || {};

    // Validate the presence of `id`
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: '"id" is required and must be a valid string.',
            }),
        };
    }

    try {
        // Attempt to retrieve the item from DynamoDB
        const item = await getItem(id, tableName);

        // If no item was found, return 404
        if (!item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `Item with id "${id}" not found.`,
                }),
            };
        }

        // Return the found item
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Item retrieved successfully',
                item,
            }),
        };
    } catch (error) {
        // Log error details and return a generic server error message
        console.error('Error retrieving item:', error.message || error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                details: error.message || 'An error occurred while retrieving the item.',
            }),
        };
    }
};

