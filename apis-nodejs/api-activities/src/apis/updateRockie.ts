import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { validateToken } from "../utils/validateToken";

const dynamoDb = new DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const token = event.headers.Authorization;
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Falta el token de autorización" }),
            };
        }

        const { tenant_id } = await validateToken(token);
        const body = JSON.parse(event.body || "{}");

        if (!body.rockie_id || !body.rockie_name) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Datos incompletos" }),
            };
        }

        await dynamoDb
            .update({
                TableName: tableName,
                Key: { tenant_id, rockie_id: body.rockie_id },
                UpdateExpression: "SET rockie_name = :rockie_name, additional_data = :additional_data",
                ExpressionAttributeValues: {
                    ":rockie_name": body.rockie_name,
                    ":additional_data": body.additional_data || {},
                },
            })
            .promise();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Rockie actualizado con éxito" }),
        };
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ message: "Error interno" }) };
    }
};
