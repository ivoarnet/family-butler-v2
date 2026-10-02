import XCTest

final class NavigationTests: XCTestCase {
    func testLaunchAndRemoteNavigation() {
        let app = XCUIApplication()
        app.launch()
        let email = app.textFields["email"]
        let password = app.secureTextFields["password"]
        XCTAssertTrue(email.waitForExistence(timeout: 10))
        XCTAssertTrue(password.exists)
        XCTAssertTrue(app.buttons["signIn"].exists)
        XCTAssertFalse(app.buttons["Sign out"].exists)

        XCUIRemote.shared.press(.down)
        XCUIRemote.shared.press(.up)
        XCTAssertTrue(email.hasFocus || password.hasFocus)

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "tvOS sign-in and remote focus"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
