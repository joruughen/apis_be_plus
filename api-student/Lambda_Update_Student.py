import boto3
import json
import logging
import os

# Configurar el logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
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
    tokens_table = dynamodb.Table('t_access_tokens')
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

    # Obtener los datos de actualización desde el evento
    update_data = event['body']

    # Conectar con DynamoDB y actualizar datos del estudiante en la tabla `t_students`
    t_students = dynamodb.Table('t_students')

    try:
        # Construir expresión de actualización
        update_expression = "SET "
        expression_attribute_values = {}

        for key, value in update_data.items():
            if key in ["student_name", "password", "birthday", "gender", "telephone", "rockie_coins", "rockie_gems"]:
                update_expression += f"student_data.{key} = :{key}, "
                expression_attribute_values[f":{key}"] = value
            else:
                update_expression += f"{key} = :{key}, "
                expression_attribute_values[f":{key}"] = value

        # Eliminar la última coma y el espacio
        update_expression = update_expression.rstrip(", ")

        db_response = t_students.update_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues="UPDATED_NEW"
        )

        # Responder con los datos actualizados
        return {
            'statusCode': 200,
            'body': db_response['Attributes']
        }

    except Exception as e:
        # Log de error detallado
        logger.error(f"Error al actualizar el estudiante desde DynamoDB: {e}")
        return {
            'statusCode': 500,
            'body': 'Error interno del servidor al actualizar datos del estudiante'
        }
