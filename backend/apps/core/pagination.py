from django.conf import settings
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination


class OptionalPageNumberPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200

    def paginate_queryset(self, queryset, request, view=None):
        self.page_size = getattr(settings, "REST_FRAMEWORK", {}).get("PAGE_SIZE", self.page_size)
        self.max_page_size = getattr(settings, "MAX_PAGE_SIZE", self.max_page_size)

        raw_page = request.query_params.get(self.page_query_param)
        raw_page_size = request.query_params.get(self.page_size_query_param)

        if raw_page is not None:
            try:
                page_val = int(raw_page)
                if page_val < 1:
                    raise ValidationError({self.page_query_param: "Page number must be at least 1."})
            except (ValueError, TypeError):
                raise ValidationError({self.page_query_param: "Enter a valid page number."})

        if raw_page_size is not None:
            try:
                page_size_val = int(raw_page_size)
                if page_size_val < 1:
                    raise ValidationError({self.page_size_query_param: "Page size must be at least 1."})
                if page_size_val > self.max_page_size:
                    raise ValidationError(
                        {self.page_size_query_param: f"Page size must not exceed {self.max_page_size}."}
                    )
            except (ValueError, TypeError):
                raise ValidationError({self.page_size_query_param: "Enter a valid page size."})

        if not (raw_page or raw_page_size or request.query_params.get("paginate") == "true"):
            return None
        return super().paginate_queryset(queryset, request, view)
