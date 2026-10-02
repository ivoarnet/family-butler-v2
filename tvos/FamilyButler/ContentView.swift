import SwiftUI

@MainActor
struct ContentView: View {
    @ObservedObject var model: AppModel
    @State private var email = ""
    @State private var password = ""
    @State private var detail: CalendarEvent?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(alignment: .leading, spacing: 32) {
            HStack {
                Text("Family Butler").font(.largeTitle.bold())
                Spacer()
                if model.signedIn {
                    Button("Sign out") { model.signOut() }
                }
            }
            if let message = model.message {
                Text(message).foregroundStyle(.yellow).font(.title3)
                    .accessibilityIdentifier("status")
            }
            if model.signedIn {
                calendar
            } else {
                signIn
            }
            if model.busy { ProgressView("Loading…") }
            Spacer(minLength: 0)
        }
        .padding(64)
        .background(Color(red: 0.04, green: 0.08, blue: 0.16).ignoresSafeArea())
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .buttonStyle(TVButtonStyle())
        .opacity(scenePhase == .active ? 1 : 0)
        .onChange(of: scenePhase) { phase in
            if phase != .active { detail = nil }
            if phase == .background { email = ""; password = "" }
        }
        .onChange(of: model.signedIn) { _ in password = ""; detail = nil }
        .onChange(of: model.busy) { busy in if busy { detail = nil } }
        .alert(item: $detail) { event in
            Alert(title: Text(event.title),
                  message: Text(event.date + " · " + (event.allDay ? "All day" : event.startTime ?? "") + "\n" + (event.location ?? "")),
                  dismissButton: .default(Text("Close")))
        }
    }

    private var signIn: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("Sign in to your household").font(.title)
            Text("Use an existing Family Butler account. This shared TV forgets your session when you leave the app.")
                .font(.title3)
            TextField("Email", text: $email)
                .textContentType(.username)
                .autocorrectionDisabled()
                .accessibilityIdentifier("email")
            SecureField("Password", text: $password)
                .textContentType(.password)
                .accessibilityIdentifier("password")
            Button("Sign in") {
                let submittedPassword = password
                password = ""
                Task { await model.signIn(email: email, password: submittedPassword) }
            }
            .disabled(model.busy || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)
            .accessibilityIdentifier("signIn")
        }
        .frame(maxWidth: 1000)
        .disabled(model.busy)
    }

    private var calendar: some View {
        VStack(alignment: .leading, spacing: 28) {
            HStack(spacing: 32) {
                Text(model.selected?.name ?? "Choose a household").font(.title.bold())
                Spacer()
                if model.selected != nil {
                    Button("Households") { Task { await model.load() } }
                }
                Button("Refresh") { Task { await model.load(model.selected) } }
            }
            .disabled(model.busy)
            if model.selected == nil {
                if model.households.isEmpty && !model.busy {
                    Text("No households available. Create a household in the web app, then refresh.").font(.title3)
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        ForEach(model.households) { household in
                            Button(household.name) { Task { await model.load(household) } }
                                .accessibilityIdentifier("household-\(household.id)")
                        }
                    }.padding(16)
                }
                .disabled(model.busy)
            } else {
                Text("Upcoming · next 30 days").font(.title2)
                Text("Stored event dates only; recurring occurrences are not expanded in this prototype.")
                    .font(.callout).foregroundStyle(.secondary)
                if model.events.isEmpty {
                    Text("No upcoming events.").font(.title3)
                }
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 24) {
                        ForEach(model.events) { event in
                            Button { detail = event } label: {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text(event.title).font(.title2.bold())
                                    Text(event.date + " · " + (event.allDay ? "All day" : event.startTime ?? ""))
                                        .font(.title3)
                                    if let location = event.location, !location.isEmpty {
                                        Text(location).font(.title3).foregroundStyle(.secondary)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }.padding(16)
                }
            }
        }
        .onExitCommand {
            if model.selected != nil { Task { await model.load() } }
        }
    }
}

private struct TVButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        FocusLabel(configuration: configuration)
    }

    private struct FocusLabel: View {
        let configuration: ButtonStyle.Configuration
        @Environment(\.isFocused) private var focused
        @Environment(\.isEnabled) private var enabled

        var body: some View {
            configuration.label
                .padding(20)
                .background(focused ? Color.blue : Color.white.opacity(0.10))
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(focused ? .white : .clear, lineWidth: 4))
                .scaleEffect(configuration.isPressed ? 0.97 : 1)
                .opacity(enabled ? 1 : 0.45)
        }
    }
}
