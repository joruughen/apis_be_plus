import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { validateToken } from "./utils/validateToken";

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

        if (!body.activity_id || !body.activity_data) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Faltan parámetros requeridos" }),
            };
        }

        await dynamoDb
            .update({
                TableName: tableName,
                Key: { tenant_id, activity_id: body.activity_id },
                UpdateExpression: "SET activity_data = :activity_data",
                ExpressionAttributeValues: {
                    ":activity_data": body.activity_data,
                },
            })
            .promise();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Actividad actualizada con éxito" }),
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: error.message === "Token inválido" ? 403 : 500,
            body: JSON.stringify({ message: error.message || "Error interno del servidor" }),
        };
    }
};
