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
    const body = JSON.parse(event.body || '{}');
    const { activitie_type, ...otherData } = body;

    if (!activitie_type) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing activitie_type in request body' })
      };
    }

    // Generar un nuevo activity_id
    const activityId = uuidv4();
    const creationDate = moment().format('YYYY-MM-DD HH:mm:ss');

    // Crear el objeto activity_data que contendrá todos los campos anidados
    let activityData = {};

    // Iterar sobre las claves del body para separar los campos anidados de los no anidados
    for (const [key, value] of Object.entries(otherData)) {
      if (key.includes('.')) {
        // Si el nombre de la clave contiene un punto, lo tratamos como anidado
        const keys = key.split('.');
        let temp = activityData;

        // Recorrer las claves anidadas
        for (let i = 0; i < keys.length - 1; i++) {
          if (!temp[keys[i]]) temp[keys[i]] = {}; // Crear objetos intermedios si no existen
          temp = temp[keys[i]]; // Navegar al siguiente nivel
        }

        // Asignar el valor final al último nivel de la jerarquía
        temp[keys[keys.length - 1]] = value;
      } else {
        // Si no es un campo anidado, lo guardamos directamente en el objeto principal
        newActivityItem[key] = value;
      }
    }

    // Crear el objeto de la actividad
    const newActivityItem = {
      tenant_id: tenantId,
      activity_id: activityId,
      student_id: studentId,
      activitie_type: activitie_type,
      creation_date: creationDate,
      activity_data: activityData, // Aquí guardamos los datos anidados
    };

    // Verificar si la actividad ya existe para este student_id y tenant_id
    const existingActivity = await docClient.send(new GetCommand({
      TableName: ACTIVITIES_TABLE,
      Key: { tenant_id: tenantId, activity_id: activityId}
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
      body: JSON.stringify({
        message: 'Activity created successfully',
        activity: newActivityItem
      })
    };

  } catch (error) {
    console.error('Error occurred:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
