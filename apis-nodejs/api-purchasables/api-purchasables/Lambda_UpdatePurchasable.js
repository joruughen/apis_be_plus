const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

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
                body: JSON.stringify({ error: validatePayload.body || 'Unauthorized Access' })
            };
        }

        // Recuperar tenant_id y student_id del token
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

        // Obtener el product_id desde los parámetros del body
        const { product_id, store_type, product_info } = event.body;

        if (!product_id) {
            return {
                statusCode: 400,
                body: { error: 'Missing product_id in request body' }
            };
        }

        // Buscar el 'purchasable' en la base de datos
        const purchasable = await docClient.send(new GetCommand({
            TableName: PURCHASABLES_TABLE,
            Key: { tenant_id: tenantId, product_id }
        }));

        if (!purchasable.Item) {
            return {
                statusCode: 404,
                body: { error: 'Purchasable not found' }
            };
        }

        // Actualizar los datos del 'purchasable'
        const updatedPurchasable = {
            ...purchasable.Item,
            store_type: store_type || purchasable.Item.store_type,
            product_info: product_info || purchasable.Item.product_info
        };

        const updateParams = {
            TableName: PURCHASABLES_TABLE,
            Key: { tenant_id: tenantId, product_id },
            UpdateExpression: 'SET store_type = :store_type, product_info = :product_info',
            ExpressionAttributeValues: {
                ':store_type': updatedPurchasable.store_type,
                ':product_info': updatedPurchasable.product_info
            },
            ReturnValues: 'ALL_NEW'
        };

        const updatedItem = await docClient.send(new UpdateCommand(updateParams));

        return {
            statusCode: 200,
            body: {
                message: 'Purchasable updated successfully',
                purchasable: updatedItem.Attributes
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
