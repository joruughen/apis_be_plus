const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PURCHASABLES_TABLE = `${process.env.STAGE}_t_purchasable`;  // Changed to reflect purchasable items
const TOKENS_TABLE = `${process.env.STAGE}_t_access_tokens`;
const VALIDATE_FUNCTION_NAME = process.env.VALIDATE_FUNCTION_NAME;

exports.handler = async (event) => {
    console.log('Event received:', event);

    try {
        // Step 1: Validate the Authorization Token
        const token = event.headers['Authorization'];
        if (!token) {
            return {
                statusCode: 400,
                body: { error: 'Missing Authorization token' }
            };
        }

        // Validate the token using the ValidateAccessToken Lambda function
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

        // Step 2: Retrieve tenant_id and user_id from the token
        const tokenItem = await docClient.send(new GetCommand({
            TableName: TOKENS_TABLE,
            Key: { token },
        }));

        if (!tokenItem.Item) {
            return {
                statusCode: 403,
                body: { error: 'Invalid or expired token' }
            };
        }

        // Step 3: Extract queryStringParameters
        const query = event.query || {};  // Assuming query is parsed correctly
        const { method, limit, lastEvaluatedKey, store_type, product_id, price } = query;

// Default method is 'primaryKey' if not provided, and set a limit for pagination
        const queryMethod = method || 'primaryKey';
        const queryLimit = limit ? parseInt(limit, 10) : 10;
        console.log(`Query parameters: method=${queryMethod}, limit=${queryLimit}, lastEvaluatedKey=${lastEvaluatedKey}`);

// Step 4: Execute the query based on the selected method (GSI, LSI, or Primary Key)
        let result;

        if (queryMethod === 'gsi') {
            let keyConditionExpression = 'tenant_id = :tenantId';  // Default to filtering by tenant_id only
            let expressionAttributeValues = {
                ':tenantId': tokenItem.Item.tenant_id  // Usamos el tenant_id extraído del token
            };

            // Si product_id es proporcionado, agregamos a la condición de la clave
            if (product_id) {
                keyConditionExpression += ' AND product_id = :productId';
                expressionAttributeValues[':productId'] = product_id;
            }

            let allItems = []; // Para almacenar todos los items encontrados que cumplen con el filtro
            let lastEvaluatedKey = null; // Para paginar los resultados
            let result; // Variable para almacenar los resultados de cada consulta
            let fetchedItemsCount = 0; // Contador de items encontrados que cumplen con store_type
            const queryLimit = 10; // Queremos obtener un máximo de 10 resultados
            const storeType = store_type; // Para referirnos al store_type que buscamos

            // Mientras no tengamos 10 items y tengamos más resultados disponibles en la siguiente página
            while (fetchedItemsCount < queryLimit) {
                // Ejecutamos la consulta
                result = await docClient.send(new QueryCommand({
                    TableName: PURCHASABLES_TABLE,
                    KeyConditionExpression: keyConditionExpression,  // Filtros por tenant_id y product_id
                    ExpressionAttributeValues: expressionAttributeValues,
                    Limit: queryLimit - fetchedItemsCount,  // Limitar los resultados restantes (por paginación)
                    ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined, // Paginar si es necesario
                }));

                // Filtrar los items que cumplen con el store_type
                let filteredItems = result.Items.filter(item => item.store_type === storeType);

                // Agregar los items filtrados al array de resultados
                allItems = allItems.concat(filteredItems);
                fetchedItemsCount = allItems.length;  // Actualizar el contador de items encontrados

                // Si no encontramos suficientes resultados, actualizamos lastEvaluatedKey para seguir consultando
                if (result.LastEvaluatedKey) {
                    lastEvaluatedKey = JSON.stringify(result.LastEvaluatedKey);  // Preparar para la siguiente consulta
                } else {
                    // Si no hay más datos, terminamos
                    break;
                }
            }

            // Ahora 'allItems' tiene los primeros 10 elementos que cumplen con el store_type
            result.Items = allItems.slice(0, 10); // Asegurarse de devolver solo 10 items
            console.log('Filtered result:', result.Items);
        }






        else if (queryMethod === 'lsi') {
            // If price is provided, filter by it
            const expressionAttributeValues = {
                ':tenantId': tokenItem.Item.tenant_id,
                ':price': price
            };

            // Execute the query using LSI (price_index)
            result = await docClient.send(new QueryCommand({
                TableName: PURCHASABLES_TABLE,
                IndexName: 'price_index',  // Using the LSI
                KeyConditionExpression: 'tenant_id = :tenantId and price = :price',
                ExpressionAttributeValues: expressionAttributeValues,
                Limit: queryLimit,
                ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
            }));
        } else {
            // Execute the query by Primary Key (tenant_id + product_id)
            let keyConditionExpression = 'tenant_id = :tenantId';  // Default to filtering by tenant_id only
            let expressionAttributeValues = {
                ':tenantId': tokenItem.Item.tenant_id
            };

            // If product_id is provided, include it in the query
            if (product_id) {
                keyConditionExpression += ' AND product_id = :productId';
                expressionAttributeValues[':productId'] = product_id;
            }

            // Execute the query
            result = await docClient.send(new QueryCommand({
                TableName: PURCHASABLES_TABLE,
                KeyConditionExpression: keyConditionExpression,  // Primary Key query
                ExpressionAttributeValues: expressionAttributeValues,
                Limit: queryLimit,
                ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
            }));
        }

// Step 5: Return the results
        return {
            statusCode: 200,
            body: {
                result,
                lastEvaluatedKey: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : null
            }
        };


    } catch (error) {
        console.error('Error processing request:', error);
        return {
            statusCode: 500,
            body: { error: 'Internal Server Error' }
        };
    }
};
