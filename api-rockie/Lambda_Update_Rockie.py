
import boto3
import logging
import os
import json
from decimal import Decimal

# Configurar el logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Helper para convertir Decimal a tipos JSON serializables
def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    else:
        return obj

def lambda_handler(event, context):

    # Obtener el stage desde las variables de entorno
    stage = os.environ.get("STAGE", "dev")  # Default a "dev" si no se define

    # Obtener el token de autorización desde los headers
    token = event['headers'].get('Authorization')
    if not token:
        return {
            'statusCode': 400,
            'body': 'Falta el token de autorización'
        }

    # Obtener el nombre de la función de validación desde la variable de entorno
    validate_function_name = os.environ.get('VALIDATE_FUNCTION_NAME')
    if not validate_function_name:
        return {
            'statusCode': 500,
            'body': 'Error interno del servidor: falta configuración de la función de validación'
        }

    # Invocar la función Lambda ValidateAccessToken para validar el token
    lambda_client = boto3.client('lambda')
    payload_string = {"token": token}
    invoke_response = lambda_client.invoke(
        FunctionName=validate_function_name,
        InvocationType='RequestResponse',
        Payload=json.dumps(payload_string)
    )

    # Leer y cargar la respuesta de la invocación
    response_payload = json.loads(invoke_response['Payload'].read())
    logger.info("Response from ValidateAccessToken: %s", response_payload)

    # Verificar si el token es válido
    if response_payload.get('statusCode') == 403:
        return {
            'statusCode': 403,
            'body': response_payload.get('body', 'Acceso No Autorizado')
        }

    # Ahora que el token es válido, extraemos `tenant_id` y `student_id` desde la tabla `t_access_tokens`
    dynamodb = boto3.resource('dynamodb')
    tokens_table = dynamodb.Table(f"{stage}_t_access_tokens")
    token_response = tokens_table.get_item(
        Key={
            'token': token
        }
    )

    # Verificar si se obtuvieron los datos correctamente
    if 'Item' not in token_response:
        return {
            'statusCode': 500,
            'body': 'Error al obtener el tenant_id y student_id del token'
        }

    tenant_id = token_response['Item'].get('tenant_id')
    student_id = token_response['Item'].get('student_id')

    # Verificar que ambos valores estén presentes
    if not tenant_id or not student_id:
        return {
            'statusCode': 500,
            'body': 'Error: Falta tenant_id o student_id en el token almacenado'
        }

    # Obtener datos del cuerpo del evento
    if 'body' in event:
        try:
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        except json.JSONDecodeError:
            return {
                'statusCode': 400,
                'body': 'El cuerpo de la solicitud no es un JSON válido'
            }
    else:
        return {
            'statusCode': 400,
            'body': 'Falta el cuerpo de la solicitud'
        }

    # Conectar con DynamoDB y actualizar los datos del rockie en la tabla `t_rockies`
    t_rockies = dynamodb.Table(f"{stage}_t_rockies")

    try:
        # Construir expresión de actualización
        update_expression = "SET "
        expression_attribute_values = {}

        for key, value in body.get('updates', {}).items():
            if key.startswith("rockie_data."):
                update_expression += f"{key} = :{key.replace('.', '_')}, "
                expression_attribute_values[f":{key.replace('.', '_')}"] = value
            else:
                update_expression += f"{key} = :{key}, "
                expression_attribute_values[f":{key}"] = value

        # Eliminar la última coma y el espacio
        update_expression = update_expression.rstrip(", ")

        # Realizar la actualización
        t_rockies.update_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values
        )

        # Obtener los datos completos del rockie actualizado
        updated_rockie_response = t_rockies.get_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            }
        )

        if 'Item' not in updated_rockie_response:
            return {
                'statusCode': 500,
                'body': 'Error al obtener los datos actualizados del rockie'
            }

        # Convertir los Decimals a tipos serializables
        rockie_data = convert_decimal(updated_rockie_response['Item'])

        # Devolver los datos actualizados
        return {
            'statusCode': 200,
            'body': rockie_data
        }

    except Exception as e:
        logger.error(f"Error al actualizar los datos del rockie: {str(e)}")
        return {
            'statusCode': 500,
            'body': f"Error interno del servidor: {str(e)}"
        }
