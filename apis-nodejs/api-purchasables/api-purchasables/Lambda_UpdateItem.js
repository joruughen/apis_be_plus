const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB Client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Utility function to validate fields dynamically
const validateField = (value, type) => {
    if (value && typeof value !== type) {
        return `Invalid input. Field must be a ${type}.`;
    }
    return null;
};

// Function to handle updating fields dynamically
const buildUpdateParams = (body, existingItem, tableName, id) => {
    const updateExpression = ['SET'];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    const keys = Object.keys(body);

    // Add dynamic fields to the update expression
    keys.forEach((key) => {
        if (key !== 'id' && key !== 'updatedAt') { // Avoid overwriting id and updatedAt
            const fieldValue = body[key] !== undefined ? body[key] : existingItem[key];
            updateExpression.push(`#${key} = :${key}`);
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = fieldValue;
        }
    });

    // Add the updatedAt field
    updateExpression.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    return {
        TableName: tableName,
        Key: { id },
        UpdateExpression: updateExpression.join(', '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
    };
};

exports.handler = async (event) => {
    const stage = process.env.STAGE || 'dev'; // Ensure the stage variable is set
    const tableName = `${stage}_purchasables`; // Dynamically determine the table name
    const { id } = event.pathParameters || {}; // Extract the item ID from path parameters
    const body = JSON.parse(event.body || '{}'); // Parse the request body

    // Validate input
    if (!id || typeof id !== 'string') {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: '"id" is required in the path parameters and must be a valid string.',
            }),
        };
    }

    // Check if required fields exist and validate the rest of the fields dynamically
    const requiredFields = ['name', 'price', 'stock'];
    let validationError = null;

    // Validate each required field
    requiredFields.forEach((field) => {
        if (body[field] !== undefined) {
            validationError = validateField(body[field], typeof body[field]);
            if (validationError) return;
        }
    });

    // If there's a validation error, return it
    if (validationError) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: validationError,
            }),
        };
    }

    // Fetch the item from DynamoDB to ensure it exists
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

        // Build update parameters dynamically
        const updateParams = buildUpdateParams(body, data.Item, tableName, id);

        // Update the item in DynamoDB
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

