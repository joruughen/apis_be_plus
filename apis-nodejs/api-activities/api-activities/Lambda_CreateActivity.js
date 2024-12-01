const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

// Crear clientes para DynamoDB y Lambda usando la versión modular
const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;
const TOKENS_TABLE = `${process.env.STAGE}_t_access_tokens`;

exports.handler = async (event, context) => {
  try {
    // Obtener el token de autorización desde los headers
    const token = event.headers['Authorization'];
    if (!token) {
      return {
        statusCode: 400,
        body: { error: 'Missing Authorization token' }
      };
    }

    // Validar el token usando la función Lambda ValidateAccessToken
    const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME;
    if (!validateFunctionName) {
      return {
        statusCode: 500,
        body: { error: 'ValidateAccessToken function not configured' }
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
        body: { error: validatePayload.body || 'Unauthorized Access' }
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
        body: { error: 'Failed to retrieve tenant_id and student_id from token' }
      };
    }

    const tenantId = tokenItem.Item.tenant_id;
    const studentId = tokenItem.Item.student_id;

    if (!tenantId || !studentId) {
      return {
        statusCode: 500,
        body: { error: 'Missing tenant_id or student_id in token' }
      };
    }

    // Validar los datos del body
    const body = event.body || {};  // Asumimos que el body ya está parseado en el yml
    const { activity_id, activity_type } = body;

    if (!activity_type) {
      return {
        statusCode: 400,
        body: { error: 'Missing activity_type in request body' }
      };
    }

    // Generar un UUID para el nuevo activity_id si no está presente
    const newActivityId = activity_id || uuidv4();

    // Crear objeto de la actividad
    const creationDate = moment().format('YYYY-MM-DD HH:mm:ss');

    // Inicializar los objetos
    let activityData = {};
    let otherFields = {};

    // Iterar sobre las claves del body para extraer datos de "activity_data" y otros campos
    Object.keys(body).forEach((key) => {
      if (key.startsWith('activity_data.')) {
        const subKey = key.replace('activity_data.', '');
        activityData[subKey] = body[key];
      } else {
        otherFields[key] = body[key];
      }
    });

    // Crear el nuevo objeto de actividad
    const newActivityItem = {
      tenant_id: tenantId,
      activity_id: newActivityId,
      student_id: studentId,
      activity_type: activity_type,
      creation_date: creationDate,
      activity_data: activityData, // Aquí se agregan los campos "activity_data"
      ...otherFields // Aquí se agregan los otros campos fuera de "activity_data"
    };

    // Verificar si la actividad ya existe para este student_id y tenant_id
    const existingActivity = await docClient.send(new GetCommand({
      TableName: ACTIVITIES_TABLE,
      Key: { tenant_id: tenantId, activity_id: newActivityId }
    }));

    if (existingActivity.Item) {
      return {
        statusCode: 400,
        body: { error: 'Activity already exists for this student_id and tenant_id' }
      };
    }

    // Insertar la nueva actividad en DynamoDB
    await docClient.send(new PutCommand({
      TableName: ACTIVITIES_TABLE,
      Item: newActivityItem
    }));

    // Responder con un objeto JSON (sin stringify) para que API Gateway lo maneje adecuadamente
    return {
      statusCode: 200,
      body: {
        message: 'Activity created successfully',
        activity: newActivityItem
      }
    };

  } catch (error) {
    console.error('Error occurred:', error);
    return {
      statusCode: 500,
      body: { error: error.message }
    };
  }
};