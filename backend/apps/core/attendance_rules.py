from datetime import date, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError


ATTENDANCE_EDIT_WINDOW_DAYS = 3


def normalize_attendance_date(value) -> date:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        parsed = parse_date(value)
        if parsed:
            return parsed
    raise ValidationError({"date": "Use a valid attendance date."})


def ensure_attendance_date_is_editable(value) -> date:
    attendance_date = normalize_attendance_date(value)
    today = timezone.localdate()
    oldest_editable = today - timedelta(days=ATTENDANCE_EDIT_WINDOW_DAYS)

    if attendance_date > today:
        raise ValidationError({"date": "Future attendance dates are not allowed."})
    if attendance_date < oldest_editable:
        raise ValidationError(
            {
                "date": (
                    "Attendance can be edited only for today or the previous "
                    f"{ATTENDANCE_EDIT_WINDOW_DAYS} days."
                )
            }
        )
    return attendance_date
