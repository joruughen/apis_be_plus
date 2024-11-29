const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;
const TOKENS_TABLE = process.env.TOKENS_TABLE;
const lambdaClient = new LambdaClient({});

exports.handler = async (event) => {
    try {
        // Obtener el activity_id desde los parámetros de la ruta
        const activityId = event.pathParameters ? event.pathParameters.activity_id : undefined;
        if (!activityId) {
            return {
                statusCode: 400,
                body: { error: 'activity_id is required in path' }
            };
        }

        // Obtener el token de autorización desde los headers
        const token = event.headers['Authorization'];
        if (!token) {
            return {
                statusCode: 400,
                body: { error: 'Missing Authorization token' }
            };
        }

        // Validar el token
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
                body: { error: 'Unauthorized' }
            };
        }

        // Obtener tenant_id y student_id desde el token
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

        // Obtener la actividad desde DynamoDB
        const activityItem = await docClient.send(new GetCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id: tenantId, activity_id: activityId }
        }));

        if (!activityItem.Item) {
            return {
                statusCode: 404,
                body: { error: 'Activity not found' }
            };
        }

        // Verificar si el student_id coincide con el del token
        if (activityItem.Item.student_id !== studentId) {
            return {
                statusCode: 403,
                body: { error: 'Unauthorized to delete this activity' }
            };
        }

        // Eliminar la actividad
        await docClient.send(new DeleteCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id: tenantId, activity_id: activityId }
        }));

        return {
            statusCode: 200,
            body: { message: 'Activity deleted successfully' }
        };

    } catch (error) {
        console.error('Error occurred:', error);
        return {
            statusCode: 500,
            body: { error: error.message }
        };
    }
};
