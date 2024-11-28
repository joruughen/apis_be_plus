import boto3
import logging
import os
import json
from datetime import datetime
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
        Key={'token': token}
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
            'body': 'Faltan tenant_id o student_id en el token almacenado'
        }

    # Obtener los datos del cuerpo del evento (los datos que se deben actualizar)
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

    # Conectar con DynamoDB y actualizar los datos del estudiante en la tabla `t_students`
    t_students = dynamodb.Table(f"{stage}_t_students")

    try:
        # Construir expresión de actualización
        update_expression = "SET "
        expression_attribute_values = {}

        # Actualizar los campos dentro de `student_data` correctamente
        for key, value in body.items():
            if key.startswith('student_data.'):  # Si la clave está en el objeto `student_data`
                key_for_update = key.replace('.', '_')  # Reemplazar los puntos por guiones bajos
                update_expression += f"student_data.{key_for_update} = :{key_for_update}, "
                expression_attribute_values[f":{key_for_update}"] = value
            else:
                update_expression += f"{key} = :{key}, "
                expression_attribute_values[f":{key}"] = value

        # Eliminar la última coma y espacio
        update_expression = update_expression.rstrip(", ")

        if not expression_attribute_values:
            return {
                'statusCode': 400,
                'body': 'No se encontraron valores válidos para actualizar'
            }

        # Realizar la actualización
        t_students.update_item(
            Key={'tenant_id': tenant_id, 'student_id': student_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values
        )

        # Obtener los datos completos del estudiante actualizado
        updated_student_response = t_students.get_item(
            Key={'tenant_id': tenant_id, 'student_id': student_id}
        )

        if 'Item' not in updated_student_response:
            return {
                'statusCode': 500,
                'body': 'Error al obtener los datos actualizados del estudiante'
            }

        # Convertir los Decimals a tipos serializables
        student_data = convert_decimal(updated_student_response['Item'])

        # Devolver los datos actualizados
        return {
            'statusCode': 200,
            'body': student_data
        }

    except Exception as e:
        logger.error(f"Error al actualizar los datos del estudiante: {str(e)}")
        return {
            'statusCode': 500,
            'body': f"Error interno del servidor: {str(e)}"
        }
