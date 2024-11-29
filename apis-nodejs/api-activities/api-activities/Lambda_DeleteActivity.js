const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

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

        // Validar el token utilizando la función Lambda ValidateAccessToken
        const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME;
        const validateResponse = await lambdaClient.send(new InvokeCommand({
            FunctionName: validateFunctionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({ token })
        }));

        const validatePayload = JSON.parse(Buffer.from(validateResponse.Payload).toString());
        if (validatePayload.statusCode === 403) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Unauthorized Access' })
            };
        }

        // Obtener el student_id desde el token
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

        const studentId = tokenItem.Item.student_id;
        const activityId = event.pathParameters.activity_id;  // Obtenemos el activity_id de la URL

        // Verificar que la actividad existe
        const activityResponse = await docClient.send(new GetCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { student_id: studentId, activity_id: activityId }
        }));

        if (!activityResponse.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Activity not found for this student_id and activity_id' })
            };
        }

        // Eliminar la actividad
        await docClient.send(new DeleteCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { student_id: studentId, activity_id: activityId }
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Activity deleted successfully' })
        };

    } catch (error) {
        console.error('Error occurred:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
