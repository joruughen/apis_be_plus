const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

// Crear clientes para DynamoDB y Lambda usando la versión modular
const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PURCHASABLES_TABLE = `${process.env.STAGE}_t_purchasable`;
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
    const { product_id, store_type } = body;

    if (!store_type) {
      return {
        statusCode: 400,
        body: { error: 'Missing store_type in request body' }
      };
    }

    // Generar un UUID para el nuevo product_id si no está presente
    const newProductId = product_id || uuidv4();

    // Crear objeto del purchasable
    const creationDate = moment().format('YYYY-MM-DD HH:mm:ss');

    // Inicializar los objetos
    let productInfo = {};
    let otherFields = {};

    // Iterar sobre las claves del body para extraer datos de "product_info" y otros campos
    Object.keys(body).forEach((key) => {
      if (key.startsWith('product_info.')) {
        const subKey = key.replace('product_info.', '');
        productInfo[subKey] = body[key];
      } else {
        otherFields[key] = body[key];
      }
    });

    // Crear el nuevo objeto de purchasable
    const newPurchasableItem = {
      tenant_id: tenantId,
      product_id: newProductId,
      store_type: store_type,
      creation_date: creationDate,
      product_info: productInfo, // Aquí se agregan los campos "product_info"
      ...otherFields // Aquí se agregan los otros campos fuera de "product_info"
    };

    // Verificar si el purchasable ya existe para este tenant_id y product_id
    const existingPurchasable = await docClient.send(new GetCommand({
      TableName: PURCHASABLES_TABLE,
      Key: { tenant_id: tenantId, product_id: newProductId }
    }));

    if (existingPurchasable.Item) {
      return {
        statusCode: 400,
        body: { error: 'Purchasable already exists for this tenant_id and product_id' }
      };
    }

    // Insertar el nuevo purchasable en DynamoDB
    await docClient.send(new PutCommand({
      TableName: PURCHASABLES_TABLE,
      Item: newPurchasableItem
    }));

    // Responder con un objeto JSON (sin stringify) para que API Gateway lo maneje adecuadamente
    return {
      statusCode: 200,
      body: {
        message: 'Purchasable created successfully',
        purchasable: newPurchasableItem
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