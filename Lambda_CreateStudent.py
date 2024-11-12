import boto3
import hashlib

# Hash password
def hash_password(password):
    # Returns the hashed password
    return hashlib.sha256(password.encode()).hexdigest()

# Function to handle user registration and password validation
def lambda_handler(event, context):
    try:
        # Get required fields
        tenant_id = event.get('tenant_id')
        student_email = event.get('student_email')
        password = event.get('password')
        
        # Verify that required fields are present
        if tenant_id and student_email and password:
            # Hash the password before storing it
            hashed_password = hash_password(password)
            
            # Build the main item with required fields
            item = {
                'tenant_id': tenant_id,
                'student_email': student_email,
                'student_data': {
                    'password': hashed_password
                }
            }

            # Optional fields to be included in student_data
            optional_fields = [
                'student_name', 'birthday', 'gender', 'creation_date',
                'telephone', 'rockie_coins', 'rockie_gems'
            ]
            
            # Add optional fields to student_data if they are present in the event
            for field in optional_fields:
                if event.get(field) is not None:
                    item['student_data'][field] = event.get(field)
            
            # Connect to DynamoDB
            dynamodb = boto3.resource('dynamodb')
            t_students = dynamodb.Table('t_students')
            
            # Store the student's data in the DynamoDB table
            t_students.put_item(Item=item)
            
            # Return an HTTP 200 (OK) status code and success message
            message = {
                'message': 'User registered successfully',
                'student_email': student_email
            }
            return {
                'statusCode': 200,
                'body': message
            }
        else:
            # Missing required fields
            message = {
                'error': 'Invalid request body: missing tenant_id, student_email, or password'
            }
            return {
                'statusCode': 400,
                'body': message
            }

    except Exception as e:
        # Exception handling, returning an HTTP 500 error code
        print("Exception:", str(e))
        message = {
            'error': str(e)
        }
        return {
            'statusCode': 500,
            'body': message
        }

