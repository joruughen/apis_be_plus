import boto3
import json

def lambda_handler(event, context):
    # Obtener token de autorización
    token = event['headers']['Authorization']

    # Validar el token y extraer el student_id
    lambda_client = boto3.client('lambda')
    payload_string = json.dumps({ "token": token })
    invoke_response = lambda_client.invoke(
        FunctionName="ValidarTokenAcceso",
        InvocationType='RequestResponse',
        Payload=payload_string
    )
    response = json.loads(invoke_response['Payload'].read())

    # Verificar si el token es válido
    if response['statusCode'] == 403:
        return {
            'statusCode': 403,
            'body': 'Forbidden - Acceso No Autorizado'
        }

    # Extraer el student_id y tenant_id desde la respuesta de validación
    student_id = response['student_id']
    tenant_id = response['tenant_id']

    # Obtener los datos de actualización desde el evento
    update_data = json.loads(event['body'])

    # Conectar con DynamoDB y actualizar datos del estudiante
    dynamodb = boto3.resource('dynamodb')
    t_students = dynamodb.Table('t_students')

    try:
        # Construir expresión de actualización
        update_expression = "SET " + ", ".join([f"{k} = :{k}" for k in update_data.keys()])
        expression_attribute_values = {f":{k}": v for k, v in update_data.items()}

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
            'body': json.dumps(db_response['Attributes'])
        }

    except Exception as e:
        print(f"Error al actualizar el estudiante: {e}")
        return {
            'statusCode': 500,
            'body': 'Error interno del servidor'
        }
