const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Initialize DynamoDB Client
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const stage = process.env.STAGE || 'dev';  // Ensure the stage variable is set
    const tableName = `${stage}_purchasables`;  // Dynamically determine the table name
    const body = JSON.parse(event.body || '{}');  // Parse the request body

    // Validate the required fields
    const { name, price, stock } = body;
    if (!name || typeof price !== 'number' || typeof stock !== 'number') {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: 'Invalid input. "name" (string), "price" (number), and "stock" (number) are required.',
            }),
        };
    }

    // Normalize and construct the item to insert
    const item = {
        id: uuidv4(),  // Generate a unique ID for the item
        name: name.trim(),  // Normalize the name field
        price,
        stock,
        createdAt: new Date().toISOString(),
    };

    // Add custom fields dynamically from the body to the item
    Object.keys(body).forEach((key) => {
        if (key !== 'name' && key !== 'price' && key !== 'stock') {
            item[key] = body[key];  // Add custom fields to the item object
        }
    });

    const params = {
        TableName: tableName,
        Item: item,
    };

    try {
        // Insert the item into the DynamoDB table
        await docClient.send(new PutCommand(params));

        return {
            statusCode: 201,
            body: JSON.stringify({
                message: 'Item created successfully',
                stage,
                item,
            }),
        };
    } catch (error) {
        console.error('Error inserting item into DynamoDB:', error.message || error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                details: error.message || 'An error occurred while creating the item.',
            }),
        };
    }
};


