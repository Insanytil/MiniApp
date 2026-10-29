from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette import status


def _clean_validation_message(message: str) -> str:
    prefix = "Value error, "

    if message.startswith(prefix):
        return message[len(prefix):]

    return message


async def request_validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    errors = []

    for error in exc.errors():
        location = error.get("loc", ())
        field = location[-1] if location else None

        errors.append(
            {
                "field": field,
                "message": _clean_validation_message(
                    error.get(
                        "msg",
                        "Invalid value",
                    )
                ),
            }
        )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "detail": "Invalid request data",
            "errors": errors,
        },
    )