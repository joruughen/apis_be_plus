const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB Client
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const stage = process.env.STAGE || 'dev';  // Ensure the stage variable is set
    const tableName = `${stage}_purchasables`;  // Dynamically determine the table name
    const { id } = event.pathParameters || {};  // Extract the item ID from path parameters
    const body = JSON.parse(event.body || '{}');  // Parse the request body

    // Validate input
    if (!id) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: '"id" is required in the path parameters.',
            }),
        };
    }

    const { name, price, stock } = body;

    // Validate the updated fields
    if (name && typeof name !== 'string') {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: 'Invalid input. "name" must be a string.',
            }),
        };
    }

    if (price && typeof price !== 'number') {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: 'Invalid input. "price" must be a number.',
            }),
        };
    }

    if (stock && typeof stock !== 'number') {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: 'Invalid input. "stock" must be a number.',
            }),
        };
    }

    // Check if the item exists in the database
    const getParams = {
        TableName: tableName,
        Key: { id },
    };

    try {
        const data = await docClient.send(new GetCommand(getParams));

        if (!data.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `Item with id "${id}" not found.`,
                }),
            };
        }

        // Construct the update parameters
        const updateParams = {
            TableName: tableName,
            Key: { id },
            UpdateExpression: 'SET #name = :name, #price = :price, #stock = :stock, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#name': 'name',
                '#price': 'price',
                '#stock': 'stock',
            },
            ExpressionAttributeValues: {
                ':name': name || data.Item.name,  // Keep current values if no new ones are provided
                ':price': price || data.Item.price,
                ':stock': stock || data.Item.stock,
                ':updatedAt': new Date().toISOString(),
            },
            ReturnValues: 'ALL_NEW',  // Return the updated item
        };

        // Update the item in the DynamoDB table
        const updatedItem = await docClient.send(new UpdateCommand(updateParams));

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Item updated successfully',
                item: updatedItem.Attributes,
            }),
        };
    } catch (error) {
        console.error('Error updating item in DynamoDB:', error.message || error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                details: error.message || 'An error occurred while updating the item.',
            }),
        };
    }
};
