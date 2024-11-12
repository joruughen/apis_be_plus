import boto3
import hashlib
import uuid  # For generating unique values
from datetime import datetime, timedelta

# Function to hash the password
def hash_password(password):
    # Returns the hashed password
    return hashlib.sha256(password.encode()).hexdigest()

# Main Lambda function for user login
def lambda_handler(event, context):
    # Retrieve input data
    tenant_id = event.get('tenant_id')
    student_email = event.get('student_email')
    password = event.get('password')

    # Verify that required fields are present
    if not tenant_id or not student_email or not password:
        return {
            'statusCode': 400,
            'body': 'Invalid request body: missing tenant_id, student_email, or password'
        }

    # Hash the provided password
    hashed_password = hash_password(password)

    # Connect to DynamoDB and get the students table
    dynamodb = boto3.resource('dynamodb')
    t_students = dynamodb.Table('t_students')

    # Look up the user in the students table
    response = t_students.get_item(
        Key={
            'tenant_id': tenant_id,
            'student_email': student_email
        }
    )

    # Check if the user exists
    if 'Item' not in response:
        return {
            'statusCode': 403,
            'body': 'User does not exist'
        }

    # Retrieve the stored password from the database
    student_data = response['Item']['student_data']
    hashed_password_db = student_data.get('password')

    # Verify if the password is correct
    if hashed_password != hashed_password_db:
        return {
            'statusCode': 403,
            'body': 'Incorrect password'
        }

    # Generate a unique token and expiration time
    token = str(uuid.uuid4())
    expiration_time = datetime.now() + timedelta(minutes=60)
    token_record = {
        'tenant_id': tenant_id,
        'student_email': student_email,
        'token': token,
        'expires': expiration_time.strftime('%Y-%m-%d %H:%M:%S')
    }

    # Save the token in the access tokens table
    t_tokens_access = dynamodb.Table('t_tokens_access')
    t_tokens_access.put_item(Item=token_record)

    # JSON output with the generated token
    return {
        'statusCode': 200,
        'token': token
    }
