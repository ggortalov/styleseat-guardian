"""Seed script to populate the database with demo data."""
import sys
import os
import json
import random
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import User, Project, Suite, Section, TestCase, TestRun, TestResult, ResultHistory, TokenBlocklist

app = create_app()

with app.app_context():
    # Clear existing data
    db.drop_all()
    db.create_all()

    # Create users
    user = User(username="demo", email="ggortalov+demo@styleseat.com")
    user.set_password("DemoStyleSeat22@")
    db.session.add(user)
    db.session.flush()

    # Create projects
    projects = [
        Project(name="E-Commerce Platform", description="Online shopping application with cart, checkout, and payment processing", created_by=user.id),
        Project(name="Mobile Banking API", description="REST API for the mobile banking application", created_by=user.id),
    ]
    for p in projects:
        db.session.add(p)
    db.session.flush()

    # === Project 1: E-Commerce ===
    ecom = projects[0]

    # Suites
    checkout_suite = Suite(project_id=ecom.id, name="Checkout Flow", description="End-to-end checkout process tests")
    user_mgmt_suite = Suite(project_id=ecom.id, name="User Management", description="Registration, login, profile tests")
    db.session.add_all([checkout_suite, user_mgmt_suite])
    db.session.flush()

    # Sections for checkout
    cart_section = Section(suite_id=checkout_suite.id, name="Shopping Cart", display_order=0)
    payment_section = Section(suite_id=checkout_suite.id, name="Payment", display_order=1)
    confirm_section = Section(suite_id=checkout_suite.id, name="Order Confirmation", display_order=2)
    db.session.add_all([cart_section, payment_section, confirm_section])
    db.session.flush()

    # Child sections under Payment
    cc_section = Section(suite_id=checkout_suite.id, parent_id=payment_section.id, name="Credit Card", display_order=0)
    paypal_section = Section(suite_id=checkout_suite.id, parent_id=payment_section.id, name="PayPal", display_order=1)
    db.session.add_all([cc_section, paypal_section])
    db.session.flush()

    # Sections for user management
    reg_section = Section(suite_id=user_mgmt_suite.id, name="Registration", display_order=0)
    login_section = Section(suite_id=user_mgmt_suite.id, name="Login", display_order=1)
    profile_section = Section(suite_id=user_mgmt_suite.id, name="Profile", display_order=2)
    db.session.add_all([reg_section, login_section, profile_section])
    db.session.flush()

    # Test cases: (suite_id, section_id, title, case_type, priority, steps)
    test_cases_data = [
        # Cart
        (checkout_suite.id, cart_section.id, "Add single item to cart", "Functional", "High", [
            {"action": "Navigate to product page", "expected": "Product details displayed"},
            {"action": "Click 'Add to Cart'", "expected": "Item added, cart count increases"},
            {"action": "Open cart", "expected": "Item visible with correct price"},
        ]),
        (checkout_suite.id, cart_section.id, "Add multiple items to cart", "Functional", "High", [
            {"action": "Add 3 different items", "expected": "Cart shows 3 items"},
            {"action": "Verify subtotal", "expected": "Subtotal matches sum of items"},
        ]),
        (checkout_suite.id, cart_section.id, "Remove item from cart", "Functional", "Medium", [
            {"action": "Open cart with items", "expected": "Cart items displayed"},
            {"action": "Click remove on an item", "expected": "Item removed, totals updated"},
        ]),
        (checkout_suite.id, cart_section.id, "Update item quantity", "Functional", "Medium", [
            {"action": "Change quantity to 3", "expected": "Quantity updated"},
            {"action": "Verify line total", "expected": "Price multiplied by 3"},
        ]),
        # Credit Card
        (checkout_suite.id, cc_section.id, "Pay with valid credit card", "Functional", "Critical", [
            {"action": "Enter valid card details", "expected": "Fields accepted"},
            {"action": "Click 'Pay Now'", "expected": "Payment processed successfully"},
        ]),
        (checkout_suite.id, cc_section.id, "Pay with expired card", "Functional", "High", [
            {"action": "Enter expired card details", "expected": "Error message displayed"},
        ]),
        (checkout_suite.id, cc_section.id, "Pay with insufficient funds", "Functional", "High", [
            {"action": "Enter card with insufficient funds", "expected": "Decline message shown"},
        ]),
        # PayPal
        (checkout_suite.id, paypal_section.id, "Pay with PayPal account", "Functional", "High", [
            {"action": "Select PayPal", "expected": "Redirected to PayPal"},
            {"action": "Login and confirm", "expected": "Payment successful, redirected back"},
        ]),
        (checkout_suite.id, paypal_section.id, "Cancel PayPal payment", "Functional", "Medium", [
            {"action": "Click cancel on PayPal page", "expected": "Returned to checkout"},
        ]),
        # Confirmation
        (checkout_suite.id, confirm_section.id, "Order confirmation page displays", "Functional", "High", [
            {"action": "Complete payment", "expected": "Confirmation page with order number"},
            {"action": "Verify order details", "expected": "Items, totals, shipping address correct"},
        ]),
        (checkout_suite.id, confirm_section.id, "Confirmation email sent", "Functional", "Medium", [
            {"action": "Complete order", "expected": "Confirmation email received"},
        ]),
        # Registration
        (user_mgmt_suite.id, reg_section.id, "Register with valid data", "Functional", "Critical", [
            {"action": "Fill all required fields", "expected": "Fields accepted"},
            {"action": "Submit form", "expected": "Account created, logged in"},
        ]),
        (user_mgmt_suite.id, reg_section.id, "Register with existing email", "Functional", "High", [
            {"action": "Enter already registered email", "expected": "Error: email already exists"},
        ]),
        (user_mgmt_suite.id, reg_section.id, "Register with weak password", "Security", "High", [
            {"action": "Enter password '123'", "expected": "Password strength error"},
        ]),
        # Login
        (user_mgmt_suite.id, login_section.id, "Login with valid credentials", "Functional", "Critical", [
            {"action": "Enter correct username and password", "expected": "Successfully logged in"},
        ]),
        (user_mgmt_suite.id, login_section.id, "Login with wrong password", "Functional", "High", [
            {"action": "Enter incorrect password", "expected": "Error: invalid credentials"},
        ]),
        (user_mgmt_suite.id, login_section.id, "Forgot password flow", "Functional", "Medium", [
            {"action": "Click 'Forgot Password'", "expected": "Email input shown"},
            {"action": "Enter email and submit", "expected": "Reset email sent"},
        ]),
        # Profile
        (user_mgmt_suite.id, profile_section.id, "Update profile name", "Functional", "Medium", [
            {"action": "Edit display name", "expected": "Name field editable"},
            {"action": "Save changes", "expected": "Name updated successfully"},
        ]),
        (user_mgmt_suite.id, profile_section.id, "Change password", "Functional", "High", [
            {"action": "Enter current and new password", "expected": "Password changed"},
        ]),
        (user_mgmt_suite.id, profile_section.id, "Upload avatar", "Functional", "Low", [
            {"action": "Select image file", "expected": "Preview shown"},
            {"action": "Save", "expected": "Avatar updated"},
        ]),
    ]

    cases = []
    for suite_id, section_id, title, case_type, priority, steps in test_cases_data:
        tc = TestCase(
            suite_id=suite_id,
            section_id=section_id,
            title=title,
            case_type=case_type,
            priority=priority,
            steps=json.dumps(steps),
            preconditions="User is logged in" if section_id not in [reg_section.id, login_section.id] else "",
            created_by=user.id,
        )
        db.session.add(tc)
        cases.append(tc)
    db.session.flush()

    # === Project 2: Mobile Banking ===
    bank = projects[1]
    api_suite = Suite(project_id=bank.id, name="API Endpoints", description="REST API endpoint testing")
    db.session.add(api_suite)
    db.session.flush()

    auth_section = Section(suite_id=api_suite.id, name="Authentication", display_order=0)
    accounts_section = Section(suite_id=api_suite.id, name="Accounts", display_order=1)
    transfers_section = Section(suite_id=api_suite.id, name="Transfers", display_order=2)
    db.session.add_all([auth_section, accounts_section, transfers_section])
    db.session.flush()

    bank_cases_data = [
        (api_suite.id, auth_section.id, "POST /auth/login returns JWT", "Functional", "Critical", []),
        (api_suite.id, auth_section.id, "POST /auth/login with invalid credentials", "Functional", "High", []),
        (api_suite.id, auth_section.id, "POST /auth/refresh token", "Functional", "High", []),
        (api_suite.id, accounts_section.id, "GET /accounts returns user accounts", "Functional", "Critical", []),
        (api_suite.id, accounts_section.id, "GET /accounts/:id returns account details", "Functional", "High", []),
        (api_suite.id, accounts_section.id, "GET /accounts/:id/transactions", "Functional", "High", []),
        (api_suite.id, transfers_section.id, "POST /transfers creates transfer", "Functional", "Critical", []),
        (api_suite.id, transfers_section.id, "POST /transfers insufficient funds", "Functional", "High", []),
        (api_suite.id, transfers_section.id, "POST /transfers invalid account", "Functional", "Medium", []),
        (api_suite.id, transfers_section.id, "GET /transfers/:id returns transfer status", "Functional", "Medium", []),
    ]

    bank_cases = []
    for suite_id, section_id, title, case_type, priority, steps in bank_cases_data:
        tc = TestCase(
            suite_id=suite_id,
            section_id=section_id,
            title=title,
            case_type=case_type,
            priority=priority,
            steps=json.dumps(steps) if steps else None,
            created_by=user.id,
        )
        db.session.add(tc)
        bank_cases.append(tc)
    db.session.flush()

    # Create test runs with results
    statuses = ["Passed", "Failed", "Blocked", "Retest", "Untested"]

    # Run 1: E-Commerce Checkout - mostly passed
    run1 = TestRun(project_id=ecom.id, suite_id=checkout_suite.id, name="Sprint 12 Regression", created_by=user.id)
    db.session.add(run1)
    db.session.flush()

    checkout_cases = [c for c in cases if c.section_id in [cart_section.id, cc_section.id, paypal_section.id, confirm_section.id]]
    for tc in checkout_cases:
        s = random.choices(statuses, weights=[60, 15, 10, 5, 10])[0]
        r = TestResult(run_id=run1.id, case_id=tc.id, status=s, tested_by=user.id if s != "Untested" else None,
                       tested_at=datetime.now(timezone.utc) if s != "Untested" else None,
                       comment="Verified" if s == "Passed" else ("Bug found" if s == "Failed" else None),
                       defect_id=f"BUG-{random.randint(100,999)}" if s == "Failed" else None)
        db.session.add(r)
        db.session.flush()
        if s != "Untested":
            h = ResultHistory(result_id=r.id, status=s, comment=r.comment, defect_id=r.defect_id, changed_by=user.id)
            db.session.add(h)

    # Run 2: E-Commerce User Management - mixed
    run2 = TestRun(project_id=ecom.id, suite_id=user_mgmt_suite.id, name="Sprint 12 User Tests", created_by=user.id)
    db.session.add(run2)
    db.session.flush()

    user_cases = [c for c in cases if c.section_id in [reg_section.id, login_section.id, profile_section.id]]
    for tc in user_cases:
        s = random.choices(statuses, weights=[40, 20, 15, 10, 15])[0]
        r = TestResult(run_id=run2.id, case_id=tc.id, status=s, tested_by=user.id if s != "Untested" else None,
                       tested_at=datetime.now(timezone.utc) - timedelta(days=1) if s != "Untested" else None,
                       comment="Working as expected" if s == "Passed" else ("Needs investigation" if s == "Failed" else None),
                       defect_id=f"BUG-{random.randint(100,999)}" if s == "Failed" else None)
        db.session.add(r)
        db.session.flush()
        if s != "Untested":
            h = ResultHistory(result_id=r.id, status=s, comment=r.comment, defect_id=r.defect_id, changed_by=user.id)
            db.session.add(h)

    # Run 3: Banking API - partially run
    run3 = TestRun(project_id=bank.id, suite_id=api_suite.id, name="API v2.1 Validation", created_by=user.id)
    db.session.add(run3)
    db.session.flush()

    for tc in bank_cases:
        s = random.choices(statuses, weights=[35, 10, 5, 5, 45])[0]
        r = TestResult(run_id=run3.id, case_id=tc.id, status=s, tested_by=user.id if s != "Untested" else None,
                       tested_at=datetime.now(timezone.utc) - timedelta(hours=3) if s != "Untested" else None)
        db.session.add(r)
        db.session.flush()
        if s != "Untested":
            h = ResultHistory(result_id=r.id, status=s, changed_by=user.id)
            db.session.add(h)

    db.session.commit()

    print("Seed data created successfully!")
    print(f"  User: demo / DemoStyleSeat22@")
    print(f"  Projects: {len(projects)}")
    print(f"  Suites: 3")
    print(f"  Test Cases: {len(cases) + len(bank_cases)}")
    print(f"  Test Runs: 3")
