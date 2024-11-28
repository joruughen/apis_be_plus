import { Lambda } from "aws-sdk";

const lambda = new Lambda();
const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME!;

export const validateToken = async (token: string) => {
    try {
        const response = await lambda
            .invoke({
                FunctionName: validateFunctionName,
                InvocationType: "RequestResponse",
                Payload: JSON.stringify({ token }),
            })
            .promise();

        if (!response.Payload) {
            throw new Error("La respuesta de la función de validación está vacía.");
        }

        const payload = JSON.parse(response.Payload.toString());

        if (payload.statusCode === 403) {
            throw new Error("Token inválido");
        }

        return payload.body; // Aquí está el tenant_id y student_id
    } catch (error) {
        console.error("Error en la validación del token:", error.message);
        throw error;
    }
};
