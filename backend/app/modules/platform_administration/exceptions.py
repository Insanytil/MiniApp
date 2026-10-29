class OrganizationSlugAlreadyExistsError(Exception):
    pass


class OrganizationNameAlreadyExistsError(Exception):
    pass


class OrganizationNotFoundError(Exception):
    pass


class OrganizationHasMembersError(Exception):
    pass


class UserEmailAlreadyExistsError(Exception):
    pass


class PlatformUserNotFoundError(Exception):
    pass


class UserAlreadyVerifiedError(Exception):
    pass


class UserNotVerifiedError(Exception):
    pass


class OrganizationMembershipNotFoundError(Exception):
    pass


class OrganizationMembershipAlreadyExistsError(Exception):
    pass

class EmailDeliveryError(Exception):
    """The SMTP server did not confirm email submission."""
