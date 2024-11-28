
import boto3
import os
import json
from datetime import datetime

def lambda_handler(event, context):
    try:
        # Obtener el token de autorización desde los headers
        token = event['headers'].get('Authorization')
        if not token:
            return {
                'statusCode': 400,
                'body': {'error': 'Missing Authorization token'}
            }

        # Validar el token invocando la función Lambda ValidateAccessToken
        lambda_client = boto3.client('lambda')
        validate_function_name = os.environ.get('VALIDATE_FUNCTION_NAME')
        if not validate_function_name:
            return {
                'statusCode': 500,
                'body': {'error': 'ValidateAccessToken function not configured'}
            }

        validate_response = lambda_client.invoke(
            FunctionName=validate_function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps({"token": token})
        )

        validate_payload = json.loads(validate_response['Payload'].read())
        if validate_payload.get('statusCode') == 403:
            return {
                'statusCode': 403,
                'body': validate_payload.get('body', 'Unauthorized Access')
            }

        # Extraer tenant_id y student_id desde el token validado
        dynamodb = boto3.resource('dynamodb')
        tokens_table = dynamodb.Table(f"{os.environ.get('STAGE', 'dev')}_t_access_tokens")
        token_item = tokens_table.get_item(
            Key={
                'token': token
            }
        )

        if 'Item' not in token_item:
            return {
                'statusCode': 500,
                'body': {'error': 'Failed to retrieve tenant_id and student_id from token'}
            }

        tenant_id = token_item['Item'].get('tenant_id')
        student_id = token_item['Item'].get('student_id')

        if not tenant_id or not student_id:
            return {
                'statusCode': 500,
                'body': {'error': 'Missing tenant_id or student_id in token'}
            }

        # Verificar si el body tiene los datos requeridos
        body = event.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)

        rockie_name = body.get('rockie_name')
        evolution = body.get('evolution')

        if not rockie_name:
            return {
                'statusCode': 400,
                'body': {'error': 'Missing rockie_name in request body'}
            }

        # Conectar a DynamoDB y verificar si el rockie ya existe
        t_rockies = dynamodb.Table(f"{os.environ.get('STAGE', 'dev')}_t_rockies")

        existing_rockie = t_rockies.get_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            }
        )

        if 'Item' in existing_rockie:
            return {
                'statusCode': 400,
                'body': {'error': 'Rockie already exists for this student_id and tenant_id'}
            }

        # Crear el nuevo rockie
        creation_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        default_adorned = {
            "head_accessory": "head_acc001",
            "arms_accessory": "arms_acc002",
            "body_accessory": "body_acc003",
            "face_accessory": "face_acc004",
            "background_accessory": "bg_acc005"
        }

        item = {
            'tenant_id': tenant_id,
            'student_id': student_id,
            'level': body.get('level', 1),
            'experience': body.get('experience', 0),
            'rockie_data': {
                'rockie_name': rockie_name,
                'rockie_adorned': default_adorned,
                'rockie_all_accessories_ids': body.get('rockie_all_accessories_ids', []),
                'evolution': evolution or 'Stage 1'
            },
            'creation_date': creation_date
        }

        t_rockies.put_item(Item=item)

        return {
            'statusCode': 200,
            'body': {'message': 'Rockie created successfully', 'rockie_name': rockie_name}
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
