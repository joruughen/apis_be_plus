const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Initialize DynamoDB Client
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const stage = process.env.STAGE || 'dev';  // Ensure the stage variable is set
    const tableName = `${stage}_purchasables`;  // Dynamically determine the table name

    // Log the incoming event for debugging
    console.log('Received event:', JSON.stringify(event, null, 2));  // Log the entire event for detailed debugging

    const body = JSON.parse(event.body || '{}');  // Parse the request body

    // Validate the required fields
    const { name, price, stock, activity_type, activity_data } = body;

    if (!name || typeof price !== 'number' || typeof stock !== 'number') {
        const errorMessage = 'Invalid input. "name" (string), "price" (number), and "stock" (number) are required.';
        console.log('Validation failed:', errorMessage);
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: errorMessage,
            }),
        };
    }

    // Additional validation (optional for activity_type, activity_data)
    if (!activity_type || typeof activity_type !== 'string') {
        const errorMessage = '"activity_type" is required and must be a string.';
        console.log('Validation failed:', errorMessage);
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: errorMessage,
            }),
        };
    }

    // Construct IDs (example using uuidv4)
    const newActivityId = uuidv4();  // Generate a unique activity_id for the item
    const tenantId = 'someTenantId'; // Replace with logic to get tenantId, e.g., from a token or event
    const studentId = 'someStudentId'; // Replace with logic to get studentId, e.g., from a token or event
    const creationDate = new Date().toISOString(); // Creation date as current timestamp

    // Log the item parameters before adding custom fields
    console.log('Constructing item with the following data:', JSON.stringify({
        tenantId,
        newActivityId,
        studentId,
        activity_type,
        creationDate,
        activity_data
    }, null, 2));

    // Construct the item to insert into the database
    const item = {
        tenant_id: tenantId,           // Add tenant_id from context (you can get it from the token or event)
        activity_id: newActivityId,    // Generate a new unique activity_id (using uuidv4())
        student_id: studentId,         // Add student_id from context (again, probably from the token)
        activity_type,                 // activity_type (from the body)
        creation_date: creationDate,   // creationDate (set the current date or from body)
        activity_data: activity_data,  // activity_data, collected from the body
        ...body                        // Add custom fields dynamically from the body to the item object
    };

    // Log the final constructed item
    console.log('Final item to insert into DynamoDB:', JSON.stringify(item, null, 2));

    const params = {
        TableName: tableName,
        Item: item,
    };

    try {
        // Insert the item into the DynamoDB table
        await docClient.send(new PutCommand(params));

        // Log the successful creation of the item
        console.log('Item created successfully:', JSON.stringify(item, null, 2));

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



