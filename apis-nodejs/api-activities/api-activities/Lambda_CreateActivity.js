const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const moment = require('moment');

// Crear clientes para DynamoDB y Lambda usando la versión modular
const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;
const TOKENS_TABLE = `${process.env.STAGE}_t_access_tokens`;

exports.handler = async (event) => {
  try {
    // Verificar si el cuerpo está presente
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Request body is missing' })
      };
    }

    // Intentar parsear el cuerpo del evento
    let body;
    try {
      body = JSON.parse(event.body);  // Intentamos convertir el cuerpo en un objeto JSON
      // Log del cuerpo del evento antes de intentar parsearlo
      console.log('Received event body:', event.body);

    } catch (err) {
      console.error('Error parsing JSON body:', err);  // Log para depuración
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON format in request body' })
      };
    }

    // Log para depuración
    console.log('Parsed body:', body);

    // Obtener el token de autorización desde los headers
    const token = event.headers['Authorization'];
    if (!token) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing Authorization token' })
      };
    }

    // Validar el token usando la función Lambda ValidateAccessToken
    const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME;
    if (!validateFunctionName) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'ValidateAccessToken function not configured' })
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

    // Recuperar tenant_id y student_id desde el token
    const tokenItem = await docClient.send(new GetCommand({
      TableName: TOKENS_TABLE,
      Key: { token }
    }));

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

    // Validar los datos del body
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

    // Crear objeto de la actividad
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

    // Verificar si la actividad ya existe para este student_id y tenant_id
    const existingActivity = await docClient.send(new GetCommand({
      TableName: ACTIVITIES_TABLE,
      Key: { tenant_id: tenantId, activity_id: activity_id, student_id: studentId }
    }));

    if (existingActivity.Item) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Activity already exists for this student_id and tenant_id' })
      };
    }

    // Insertar la nueva actividad en DynamoDB
    await docClient.send(new PutCommand({
      TableName: ACTIVITIES_TABLE,
      Item: newActivityItem
    }));

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
