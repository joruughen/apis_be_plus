const AWS = require('aws-sdk');
const moment = require('moment');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const lambda = new AWS.Lambda();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;
const TOKENS_TABLE = `${process.env.STAGE}_t_access_tokens`;

exports.handler = async (event, context) => {
  try {
    const token = event.headers['Authorization'];
    if (!token) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing Authorization token' })
      };
    }

    // Validate the token using the ValidateAccessToken Lambda function
    const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME;
    if (!validateFunctionName) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'ValidateAccessToken function not configured' })
      };
    }

    const validateResponse = await lambda.invoke({
      FunctionName: validateFunctionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ token })
    }).promise();

    const validatePayload = JSON.parse(validateResponse.Payload);
    if (validatePayload.statusCode === 403) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: validatePayload.body || 'Unauthorized Access' })
      };
    }

    // Retrieve tenant_id and student_id from token
    const tokenItem = await dynamodb.get({
      TableName: TOKENS_TABLE,
      Key: { token }
    }).promise();

    if (!tokenItem.Item) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to retrieve tenant_id and student_id from token' })
      };
    }

    const tenantId = tokenItem.Item.tenant_id;
    const studentId = tokenItem.Item.student_id;

    if (!tenantId || !studentId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing tenant_id or student_id in token' })
      };
    }

    // Validate the body data
    const body = JSON.parse(event.body || '{}');
    const { activity_id, activitie_type, time } = body;

    if (!activity_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing activity_id in request body' })
      };
    }

    if (!activitie_type) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing activity_type in request body' })
      };
    }

    // Create activity object
    const creationDate = moment().format('YYYY-MM-DD HH:mm:ss');

    const activityData = {
      time: time || 0
    };

    const newActivityItem = {
      tenant_id: tenantId,
      activity_id: activity_id,
      student_id: studentId,
      activitie_type: activitie_type,
      creation_date: creationDate,
      activity_data: activityData
    };

    // Check if the activity already exists for this student_id and tenant_id
    const existingActivity = await dynamodb.get({
      TableName: ACTIVITIES_TABLE,
      Key: { tenant_id: tenantId, activity_id: activity_id, student_id: studentId }
    }).promise();

    if (existingActivity.Item) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Activity already exists for this student_id and tenant_id' })
      };
    }

    // Insert new activity into DynamoDB
    await dynamodb.put({
      TableName: ACTIVITIES_TABLE,
      Item: newActivityItem
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Activity created successfully', activity_id })
    };

  } catch (error) {
    console.error('Error occurred:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
