const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// Crear clientes para DynamoDB y Lambda usando la versión modular
const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PURCHASABLES_TABLE = `${process.env.STAGE}_t_purchasables`;
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

        // Acceder directamente al body de la solicitud
        const { product_id } = event.body;

        if (!product_id) {
            return {
                statusCode: 400,
                body: { error: 'Missing product_id in request body' }
            };
        }

        // Verificar si el purchasable existe para este tenant_id y product_id
        const existingPurchasable = await docClient.send(new GetCommand({
            TableName: PURCHASABLES_TABLE,
            Key: { tenant_id: tenantId, product_id: product_id }
        }));

        if (!existingPurchasable.Item) {
            return {
                statusCode: 404,
                body: { error: 'Purchasable not found for this tenant_id and product_id' }
            };
        }

        // Verificar que el student_id del purchasable coincide con el student_id del token
        if (existingPurchasable.Item.student_id !== studentId) {
            return {
                statusCode: 403,
                body: { error: 'Student ID mismatch, cannot delete this purchasable' }
            };
        }

        // Eliminar el purchasable de la base de datos
        await docClient.send(new DeleteCommand({
            TableName: PURCHASABLES_TABLE,
            Key: { tenant_id: tenantId, product_id: product_id }
        }));

        // Responder con éxito
        return {
            statusCode: 200,
            body: {
                message: 'Purchasable deleted successfully',
                product_id: product_id
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