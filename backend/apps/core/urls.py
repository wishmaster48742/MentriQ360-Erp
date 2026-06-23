from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademicEventViewSet,
    AcademicSessionViewSet,
    AccountingLedgerEntryViewSet,
    AdmitCardViewSet,
    AILogViewSet,
    AdmissionApplicationViewSet,
    AdmissionDocumentViewSet,
    AdmissionFormTemplateViewSet,
    AssetMaintenanceLogViewSet,
    AssignmentSubmissionViewSet,
    AssignedWorkViewSet,
    AnnouncementViewSet,
    ApprovalRequestViewSet,
    AttendanceDeviceViewSet,
    AttendanceRecordViewSet,
    AuditEventViewSet,
    BackupJobViewSet,
    BackupPolicyViewSet,
    CampusViewSet,
    CampusMembershipViewSet,
    ClassSectionViewSet,
    CommunicationSettingViewSet,
    DeviceSyncLogViewSet,
    DeviceLoginSessionViewSet,
    DocumentViewSet,
    DocumentAccessLogViewSet,
    DigitalLibraryResourceViewSet,
    DashboardSummaryView,
    EnterpriseAnalyticsView,
    EnterpriseMonitoringView,
    EnterpriseUsageMetricViewSet,
    ExamScheduleViewSet,
    ExamSubjectSetupViewSet,
    ExamTypeViewSet,
    FeeAssignmentViewSet,
    FeeStructureViewSet,
    FinanceEventViewSet,
    FinanceReportView,
    HealthCheckView,
    HostelAllocationViewSet,
    HostelRoomViewSet,
    InventoryAssetViewSet,
    LibraryBookViewSet,
    LibraryBookRequestViewSet,
    LibraryLoanViewSet,
    LearningResourceViewSet,
    MarketplacePluginViewSet,
    MessageTemplateViewSet,
    MobileAppBootstrapView,
    OutboundMessageViewSet,
    PaymentGatewayConfigViewSet,
    PaymentViewSet,
    PaymentTransactionViewSet,
    Phase10EcosystemDashboardView,
    PlatformSettingViewSet,
    ProductionAuditRunViewSet,
    PublicAdmissionTrackingView,
    PublicAdmissionView,
    PublicSchoolWebsiteView,
    PushNotificationDeviceViewSet,
    PushNotificationLogViewSet,
    QueueJobViewSet,
    RealTimeEventStreamView,
    RealTimeEventView,
    ReportDefinitionViewSet,
    ResultRecordViewSet,
    RoleAIToolView,
    SaaSPlanViewSet,
    SalaryRecordViewSet,
    SalarySetupViewSet,
    SchoolViewSet,
    SchoolEnterpriseAnalyticsView,
    SchoolPluginConfigViewSet,
    SchoolSubscriptionViewSet,
    SchoolWebsiteContentViewSet,
    SecureAPITokenViewSet,
    SecurityEventViewSet,
    SecurityPolicyViewSet,
    StaffAttendanceRecordViewSet,
    StaffProfileViewSet,
    StudentViewSet,
    StudentTransportAssignmentViewSet,
    SubjectViewSet,
    SubscriptionInvoiceViewSet,
    SubscriptionPaymentViewSet,
    SupportTicketViewSet,
    SystemHealthSnapshotViewSet,
    TeacherSubjectAllocationViewSet,
    TimetableSlotViewSet,
    TransportDriverViewSet,
    TransportRouteViewSet,
    TransportTripLogViewSet,
    TransportVehicleViewSet,
    TransportVehicleAttendanceViewSet,
    UserActivityLogViewSet,
    WhiteLabelConfigViewSet,
)

router = DefaultRouter()
router.register("schools", SchoolViewSet, basename="school")
router.register("campuses", CampusViewSet, basename="campus")
router.register("campus-memberships", CampusMembershipViewSet, basename="campus-membership")
router.register("attendance-devices", AttendanceDeviceViewSet, basename="attendance-device")
router.register("device-sync-logs", DeviceSyncLogViewSet, basename="device-sync-log")
router.register("device-login-sessions", DeviceLoginSessionViewSet, basename="device-login-session")
router.register("academic-sessions", AcademicSessionViewSet, basename="academic-session")
router.register("sections", ClassSectionViewSet, basename="section")
router.register("teacher-subject-allocations", TeacherSubjectAllocationViewSet, basename="teacher-subject-allocation")
router.register("subjects", SubjectViewSet, basename="subject")
router.register("students", StudentViewSet, basename="student")
router.register("attendance-records", AttendanceRecordViewSet, basename="attendance-record")
router.register("staff-attendance-records", StaffAttendanceRecordViewSet, basename="staff-attendance-record")
router.register("staff-profiles", StaffProfileViewSet, basename="staff-profile")
router.register("timetable-slots", TimetableSlotViewSet, basename="timetable-slot")
router.register("exam-types", ExamTypeViewSet, basename="exam-type")
router.register("exam-subject-setups", ExamSubjectSetupViewSet, basename="exam-subject-setup")
router.register("exam-schedules", ExamScheduleViewSet, basename="exam-schedule")
router.register("library-books", LibraryBookViewSet, basename="library-book")
router.register("library-loans", LibraryLoanViewSet, basename="library-loan")
router.register("digital-library-resources", DigitalLibraryResourceViewSet, basename="digital-library-resource")
router.register("library-book-requests", LibraryBookRequestViewSet, basename="library-book-request")
router.register("transport-routes", TransportRouteViewSet, basename="transport-route")
router.register("transport-vehicles", TransportVehicleViewSet, basename="transport-vehicle")
router.register("transport-drivers", TransportDriverViewSet, basename="transport-driver")
router.register("transport-vehicle-attendance", TransportVehicleAttendanceViewSet, basename="transport-vehicle-attendance")
router.register("transport-trip-logs", TransportTripLogViewSet, basename="transport-trip-log")
router.register("student-transport-assignments", StudentTransportAssignmentViewSet, basename="student-transport-assignment")
router.register("admission-form-templates", AdmissionFormTemplateViewSet, basename="admission-form-template")
router.register("admission-applications", AdmissionApplicationViewSet, basename="admission-application")
router.register("admission-documents", AdmissionDocumentViewSet, basename="admission-document")
router.register("inventory-assets", InventoryAssetViewSet, basename="inventory-asset")
router.register("asset-maintenance-logs", AssetMaintenanceLogViewSet, basename="asset-maintenance-log")
router.register("school-website-contents", SchoolWebsiteContentViewSet, basename="school-website-content")
router.register("push-devices", PushNotificationDeviceViewSet, basename="push-device")
router.register("push-notifications", PushNotificationLogViewSet, basename="push-notification")
router.register("marketplace-plugins", MarketplacePluginViewSet, basename="marketplace-plugin")
router.register("school-plugin-configs", SchoolPluginConfigViewSet, basename="school-plugin-config")
router.register("accounting-ledger-entries", AccountingLedgerEntryViewSet, basename="accounting-ledger-entry")
router.register("report-definitions", ReportDefinitionViewSet, basename="report-definition")
router.register("security-policies", SecurityPolicyViewSet, basename="security-policy")
router.register("security-events", SecurityEventViewSet, basename="security-event")
router.register("production-audit-runs", ProductionAuditRunViewSet, basename="production-audit-run")
router.register("hostel-rooms", HostelRoomViewSet, basename="hostel-room")
router.register("hostel-allocations", HostelAllocationViewSet, basename="hostel-allocation")
router.register("announcements", AnnouncementViewSet, basename="announcement")
router.register("approval-requests", ApprovalRequestViewSet, basename="approval-request")
router.register("support-tickets", SupportTicketViewSet, basename="support-ticket")
router.register("assigned-work", AssignedWorkViewSet, basename="assigned-work")
router.register("assignment-submissions", AssignmentSubmissionViewSet, basename="assignment-submission")
router.register("learning-resources", LearningResourceViewSet, basename="learning-resource")
router.register("result-records", ResultRecordViewSet, basename="result-record")
router.register("admit-cards", AdmitCardViewSet, basename="admit-card")
router.register("fee-structures", FeeStructureViewSet, basename="fee-structure")
router.register("fee-assignments", FeeAssignmentViewSet, basename="fee-assignment")
router.register("payments", PaymentViewSet, basename="payment")
router.register("payment-gateways", PaymentGatewayConfigViewSet, basename="payment-gateway")
router.register("payment-transactions", PaymentTransactionViewSet, basename="payment-transaction")
router.register("salary-setups", SalarySetupViewSet, basename="salary-setup")
router.register("salary-records", SalaryRecordViewSet, basename="salary-record")
router.register("finance-events", FinanceEventViewSet, basename="finance-event")
router.register("academic-events", AcademicEventViewSet, basename="academic-event")
router.register("communication-settings", CommunicationSettingViewSet, basename="communication-setting")
router.register("message-templates", MessageTemplateViewSet, basename="message-template")
router.register("outbound-messages", OutboundMessageViewSet, basename="outbound-message")
router.register("ai-logs", AILogViewSet, basename="ai-log")
router.register("documents", DocumentViewSet, basename="document")
router.register("platform-settings", PlatformSettingViewSet, basename="platform-setting")
router.register("audit-events", AuditEventViewSet, basename="audit-event")
router.register("saas-plans", SaaSPlanViewSet, basename="saas-plan")
router.register("school-subscriptions", SchoolSubscriptionViewSet, basename="school-subscription")
router.register("subscription-invoices", SubscriptionInvoiceViewSet, basename="subscription-invoice")
router.register("subscription-payments", SubscriptionPaymentViewSet, basename="subscription-payment")
router.register("white-label-configs", WhiteLabelConfigViewSet, basename="white-label-config")
router.register("user-activity-logs", UserActivityLogViewSet, basename="user-activity-log")
router.register("document-access-logs", DocumentAccessLogViewSet, basename="document-access-log")
router.register("enterprise-usage-metrics", EnterpriseUsageMetricViewSet, basename="enterprise-usage-metric")
router.register("backup-policies", BackupPolicyViewSet, basename="backup-policy")
router.register("backup-jobs", BackupJobViewSet, basename="backup-job")
router.register("queue-jobs", QueueJobViewSet, basename="queue-job")
router.register("system-health-snapshots", SystemHealthSnapshotViewSet, basename="system-health-snapshot")
router.register("secure-api-tokens", SecureAPITokenViewSet, basename="secure-api-token")

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health"),
    path("reports/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("enterprise/analytics/", EnterpriseAnalyticsView.as_view(), name="enterprise-analytics"),
    path("enterprise/school-analytics/", SchoolEnterpriseAnalyticsView.as_view(), name="enterprise-school-analytics"),
    path("enterprise/monitoring/", EnterpriseMonitoringView.as_view(), name="enterprise-monitoring"),
    path("enterprise/ecosystem/", Phase10EcosystemDashboardView.as_view(), name="phase10-ecosystem"),
    path("mobile/bootstrap/", MobileAppBootstrapView.as_view(), name="mobile-bootstrap"),
    path("public/admissions/<str:school_code>/", PublicAdmissionView.as_view(), name="public-admissions"),
    path("public/admissions/track/<str:tracking_code>/", PublicAdmissionTrackingView.as_view(), name="public-admission-track"),
    path("public/schools/<str:school_code>/website/", PublicSchoolWebsiteView.as_view(), name="public-school-website"),
    path("finance/reports/<str:report_type>/", FinanceReportView.as_view(), name="finance-report"),
    path("realtime/events/", RealTimeEventView.as_view(), name="realtime-events"),
    path("realtime/events/stream/", RealTimeEventStreamView.as_view(), name="realtime-events-stream"),
    path("ai-tools/", RoleAIToolView.as_view(), name="ai-tools"),
    path("", include(router.urls)),
]
