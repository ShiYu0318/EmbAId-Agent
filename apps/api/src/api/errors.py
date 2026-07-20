from fastapi import HTTPException, status


class ApiError(HTTPException):
    code = "error"

    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST) -> None:
        super().__init__(status_code=status_code, detail={"code": self.code, "message": message})


class NotFound(ApiError):
    code = "not_found"

    def __init__(self, message: str = "resource not found") -> None:
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class Unauthorized(ApiError):
    code = "unauthorized"

    def __init__(self, message: str = "authentication required") -> None:
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class Forbidden(ApiError):
    code = "forbidden"

    def __init__(self, message: str = "not permitted") -> None:
        super().__init__(message, status.HTTP_403_FORBIDDEN)


class Conflict(ApiError):
    code = "conflict"

    def __init__(self, message: str = "resource already exists") -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class RateLimited(ApiError):
    code = "rate_limited"

    def __init__(self, message: str = "rate limit exceeded") -> None:
        super().__init__(message, status.HTTP_429_TOO_MANY_REQUESTS)


class ProviderUnavailable(ApiError):
    code = "provider_unavailable"

    def __init__(self, message: str = "model provider is not configured") -> None:
        super().__init__(message, status.HTTP_503_SERVICE_UNAVAILABLE)
