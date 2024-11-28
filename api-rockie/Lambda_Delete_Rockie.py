
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

        t_rockies.delete_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            }
        )

        return {
            'statusCode': 200,
            'body': {'message': 'Rockie deleted successfully'}
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
