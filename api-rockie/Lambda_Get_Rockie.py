
import boto3
import json
import logging
import os

# Configurar el logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

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

    # Conectar con DynamoDB y obtener datos del rockie en la tabla `t_rockies`
    t_rockies = dynamodb.Table(f"{stage}_t_rockies")

    try:
        # Realizar la consulta en DynamoDB para obtener los datos del rockie
        db_response = t_rockies.get_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            }
        )
        logger.info("DynamoDB response for rockie: %s", db_response)

        # Verificar si el rockie existe en la tabla
        if 'Item' not in db_response:
            return {
                'statusCode': 404,
                'body': 'Rockie no encontrado'
            }

        # Responder con los datos del rockie
        return {
            'statusCode': 200,
            'body': db_response['Item']
        }

    except Exception as e:
        # Log de error detallado
        logger.error(f"Error al obtener el rockie desde DynamoDB: {e}")
        return {
            'statusCode': 500,
            'body': 'Error interno del servidor al obtener datos del rockie'
        }
