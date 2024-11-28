
import boto3
import os
import json

def lambda_handler(event, context):
    try:
        body = event.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)

        tenant_id = body.get('tenant_id')
        student_id = body.get('student_id')

        if not tenant_id or not student_id:
            return {
                'statusCode': 400,
                'body': {'error': 'Missing tenant_id or student_id'}
            }

        dynamodb = boto3.resource('dynamodb')
        stage = os.environ.get("STAGE", "dev")
        t_rockies = dynamodb.Table(f"{stage}_t_rockies")

        response = t_rockies.get_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            }
        )

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'body': {'error': 'Rockie not found'}
            }

        return {
            'statusCode': 200,
            'body': response['Item']
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
