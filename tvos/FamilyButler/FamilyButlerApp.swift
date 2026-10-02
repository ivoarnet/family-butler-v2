import SwiftUI

@main
@MainActor
struct FamilyButlerApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
                .onChange(of: scenePhase) { phase in
                    if phase == .background { model.clear() }
                }
                .task {
                    while !Task.isCancelled {
                        do { try await Task.sleep(nanoseconds: 60_000_000_000) }
                        catch { break }
                        if model.signedIn { await model.load(model.selected) }
                    }
                }
        }
    }
}
