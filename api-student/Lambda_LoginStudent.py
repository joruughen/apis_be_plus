import boto3
import hashlib
import uuid
from datetime import datetime, timedelta

# Function to hash the password
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def lambda_handler(event, context):
    # Retrieve input data
    tenant_id = event.get('tenant_id')
    student_email = event.get('student_email')
    password = event.get('password')

    if not tenant_id or not student_email or not password:
        return {
            'statusCode': 400,
            'body': 'Invalid request: missing tenant_id, student_email, or password'
        }

    hashed_password = hash_password(password)
    dynamodb = boto3.resource('dynamodb')
    t_students = dynamodb.Table('t_students')

    # Query the GSI to find the student by email
    response = t_students.query(
        IndexName='student_email_index',
        KeyConditionExpression=boto3.dynamodb.conditions.Key('student_email').eq(student_email) &
                              boto3.dynamodb.conditions.Key('tenant_id').eq(tenant_id)
    )

    if not response['Items']:
        return {
            'statusCode': 403,
            'body': 'User does not exist'
        }

    student_data = response['Items'][0]
    if hashed_password != student_data['student_data']['password']:
        return {
            'statusCode': 403,
            'body': 'Incorrect password'
        }

    # Generate token
    token = str(uuid.uuid4())
    expiration_time = datetime.now() + timedelta(hours=1)
    token_data = {
        'token': token,
        'student_id': student_data['student_id'],
        'expires': expiration_time.strftime('%Y-%m-%d %H:%M:%S')
    }

    # Store token in t_access_tokens table
    t_tokens = dynamodb.Table('t_access_tokens')
    t_tokens.put_item(Item=token_data)

    return {
        'statusCode': 200,
        'body': {
            'message': 'Login successful',
            'token': token
        }
    }
