const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

// Crear un cliente de DynamoDB
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  const stage = process.env.STAGE || 'dev';  // Asegúrate de tener esta variable configurada en Lambda
  const body = JSON.parse(event.body || '{}');  // Aseguramos que el body esté en formato JSON

  // Limitar a 10 elementos por defecto
  const limit = body.limit || 10;

  // Parametros para el filtro de la consulta
  const filterKeys = Object.keys(body).filter(key => key !== 'limit' && key !== 'lastEvaluatedKey');
  let filterExpression = [];
  let expressionAttributeValues = {};
  let indexName = null;

  // Configurar los filtros y el índice a usar
  filterKeys.forEach(key => {
    filterExpression.push(`${key} = :${key}`);
    expressionAttributeValues[`:${key}`] = body[key];

    // Determinar el índice que vamos a usar dependiendo del filtro
    if (key === 'student_id') {
      indexName = 'student_id_index';  // Usar índice para student_id si está presente
    } else if (key === 'activity_type') {
      indexName = 'activity_type_index';  // Usar índice para activity_type si está presente
    }
  });

  // Construir los parámetros para la consulta
  const params = {
    TableName: `${stage}_t_activities`,
    FilterExpression: filterExpression.length ? filterExpression.join(' AND ') : undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    Limit: limit,
  };

  // Si hay un índice, usarlo en la consulta
  if (indexName) {
    params.IndexName = indexName;
  }

  try {
    // Realizar la consulta
    const data = await docClient.send(new QueryCommand(params));

    // Si encontramos elementos, retornarlos
    return {
      statusCode: 200,
      body: JSON.stringify({ items: data.Items }),
    };
  } catch (error) {
    console.error('Error querying DynamoDB:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};
