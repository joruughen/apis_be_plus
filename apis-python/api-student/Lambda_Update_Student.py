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
    stage = os.environ.get("STAGE", "dev")

    # Obtener el token de autorización desde los headers
    token = event['headers'].get('Authorization')
    if not token:
        return {
            'statusCode': 400,
            'body': 'Falta el token de autorización'
        }

    # Validar el token invocando otra función Lambda
    validate_function_name = os.environ.get('VALIDATE_FUNCTION_NAME')
    if not validate_function_name:
        return {
            'statusCode': 500,
            'body': 'Error interno del servidor: falta configuración de la función de validación'
        }

    lambda_client = boto3.client('lambda')
    invoke_response = lambda_client.invoke(
        FunctionName=validate_function_name,
        InvocationType='RequestResponse',
        Payload=json.dumps({'token': token})
    )

    response_payload = json.loads(invoke_response['Payload'].read())
    if response_payload.get('statusCode') == 403:
        return {
            'statusCode': 403,
            'body': response_payload.get('body', 'Acceso No Autorizado')
        }

    # Obtener tenant_id y student_id desde la tabla de tokens
    dynamodb = boto3.resource('dynamodb')
    tokens_table = dynamodb.Table(f"{stage}_t_access_tokens")
    token_response = tokens_table.get_item(Key={'token': token})

    if 'Item' not in token_response:
        return {
            'statusCode': 500,
            'body': 'Error al obtener tenant_id y student_id del token'
        }

    tenant_id = token_response['Item'].get('tenant_id')
    student_id = token_response['Item'].get('student_id')

    if not tenant_id or not student_id:
        return {
            'statusCode': 500,
            'body': 'Faltan tenant_id o student_id en el token almacenado'
        }

    # Obtener datos del cuerpo del evento
    if 'body' in event:
        try:
            body = json.loads(event['body'])
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

    # Conectar con la tabla de estudiantes
    t_students = dynamodb.Table(f"{stage}_t_students")

    try:
        # Construir expresión de actualización
        update_expression = "SET "
        expression_attribute_values = {}

        for key, value in body.items():
            if key == "token":  # Asegurar que el token no se modifica
                continue
            update_expression += f"{key} = :{key}, "
            expression_attribute_values[f":{key}"] = value

        # Validar que existan datos para actualizar
        if not expression_attribute_values:
            return {
                'statusCode': 400,
                'body': 'No se encontraron datos válidos para actualizar'
            }

        update_expression = update_expression.rstrip(", ")

        # Actualizar los datos en DynamoDB
        t_students.update_item(
            Key={'tenant_id': tenant_id, 'student_id': student_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values
        )

        # Recuperar y devolver los datos actualizados
        updated_response = t_students.get_item(Key={'tenant_id': tenant_id, 'student_id': student_id})

        if 'Item' not in updated_response:
            return {
                'statusCode': 500,
                'body': 'Error al obtener los datos actualizados del estudiante'
            }

        updated_data = convert_decimal(updated_response['Item'])
        return {
            'statusCode': 200,
            'body': json.dumps(updated_data)
        }

    except Exception as e:
        logger.error(f"Error al actualizar los datos del estudiante: {str(e)}")
        return {
            'statusCode': 500,
            'body': f"Error interno del servidor: {str(e)}"
        }

