import QtQuick
import QtQuick.Window
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: root
    width: 1024
    height: 768
    visible: true
    title: qsTr("SecScore - 教育场景个人积分管理")

    // Access theme from app
    color: app.colors && app.colors.background ? app.colors.background : "#f5f5f5"

    property bool isFirstRun: app ? app.isFirstRun() : false

    // Theme properties with fallback
    property var themeColors: app.colors || ({
        background: "#f5f5f5",
        surface: "#ffffff",
        primary: "#4A90E2",
        primaryDark: "#357ABD",
        text: "#333333",
        textSecondary: "#666666",
        textDisabled: "#999999",
        border: "#e0e0e0",
        divider: "#eeeeee",
        success: "#4CAF50",
        warning: "#FF9800",
        danger: "#F44336",
        info: "#2196F3",
        card: "#ffffff"
    })

    property var themeRadius: app.radius || ({
        small: 4,
        medium: 8,
        large: 12,
        round: 50
    })

    property var themeSpacing: app.spacing || ({
        xxs: 4,
        xs: 8,
        sm: 12,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 48
    })

    property var themeFonts: app.fonts || ({
        tiny: 10,
        small: 12,
        medium: 14,
        large: 16,
        xlarge: 18,
        xxlarge: 20,
        title: 24
    })

    StackView {
        id: stackView
        anchors.fill: parent
        initialItem: isFirstRun ? firstRunWizard : mainPage
    }

    Component {
        id: firstRunWizard

        Rectangle {
            color: themeColors.background

            ColumnLayout {
                anchors.centerIn: parent
                spacing: themeSpacing.lg

                // App icon placeholder
                Rectangle {
                    width: 128
                    height: 128
                    radius: themeRadius.large
                    color: themeColors.primary
                    Layout.alignment: Qt.AlignHCenter

                    Text {
                        anchors.centerIn: parent
                        text: "📊"
                        font.pixelSize: 64
                    }
                }

                Text {
                    text: qsTr("欢迎使用 SecScore")
                    font.pixelSize: themeFonts.title
                    font.bold: true
                    color: themeColors.text
                    Layout.alignment: Qt.AlignHCenter
                }

                Text {
                    text: qsTr("教育场景个人积分管理系统")
                    font.pixelSize: themeFonts.medium
                    color: themeColors.textSecondary
                    Layout.alignment: Qt.AlignHCenter
                }

                Text {
                    text: qsTr("请选择运行模式")
                    font.pixelSize: themeFonts.small
                    color: themeColors.textSecondary
                    Layout.alignment: Qt.AlignHCenter
                    Layout.topMargin: themeSpacing.md
                }

                // Local mode button
                Rectangle {
                    width: 240
                    height: 50
                    color: themeColors.primary
                    radius: themeRadius.medium
                    Layout.alignment: Qt.AlignHCenter
                    Layout.topMargin: themeSpacing.lg

                    Behavior on color {
                        ColorAnimation { duration: 150 }
                    }

                    Label {
                        anchors.centerIn: parent
                        text: qsTr("本地模式 (离线使用)")
                        color: "white"
                        font.pixelSize: themeFonts.medium
                        font.bold: true
                    }

                    MouseArea {
                        anchors.fill: parent
                        hoverEnabled: true
                        onEntered: parent.color = themeColors.primaryDark
                        onExited: parent.color = themeColors.primary
                        onClicked: {
                            app.setRunMode("local")
                            let settings = app.loadSettings()
                            settings["firstRunCompleted"] = "true"
                            app.saveSettings(settings)
                            stackView.replace(mainPage)
                        }
                    }
                }

                // Remote mode button
                Rectangle {
                    width: 240
                    height: 50
                    color: themeColors.textSecondary
                    radius: themeRadius.medium
                    Layout.alignment: Qt.AlignHCenter
                    Layout.topMargin: themeSpacing.sm

                    Behavior on color {
                        ColorAnimation { duration: 150 }
                    }

                    Label {
                        anchors.centerIn: parent
                        text: qsTr("远程模式 (WebSocket)")
                        color: "white"
                        font.pixelSize: themeFonts.medium
                        font.bold: true
                    }

                    MouseArea {
                        anchors.fill: parent
                        hoverEnabled: true
                        onEntered: parent.color = themeColors.text
                        onExited: parent.color = themeColors.textSecondary
                        onClicked: {
                            // TODO: Show WS URL dialog in step 5
                            console.log("Remote mode clicked - will implement in step 5")
                        }
                    }
                }
            }
        }
    }

    Component {
        id: mainPage

        Rectangle {
            color: themeColors.background

            RowLayout {
                anchors.fill: parent
                spacing: 0

                // Sidebar
                Rectangle {
                    Layout.preferredWidth: 200
                    Layout.fillHeight: true
                    color: themeColors.card
                    border.color: themeColors.border
                    border.width: 1

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: themeSpacing.md
                        spacing: themeSpacing.xs

                        // App title
                        Label {
                            text: qsTr("SecScore")
                            font.pixelSize: themeFonts.xlarge
                            font.bold: true
                            color: themeColors.primary
                            Layout.alignment: Qt.AlignHCenter
                            Layout.topMargin: themeSpacing.sm
                        }

                        Rectangle {
                            height: 1
                            color: themeColors.divider
                            Layout.fillWidth: true
                            Layout.topMargin: themeSpacing.sm
                            Layout.bottomMargin: themeSpacing.sm
                        }

                        // Navigation items
                        Repeater {
                            model: [
                                { name: qsTr("学生管理"), icon: "👥", tag: "students" },
                                { name: qsTr("事件记录"), icon: "📝", tag: "events" },
                                { name: qsTr("排行榜"), icon: "🏆", tag: "leaderboard" },
                                { name: qsTr("设置"), icon: "⚙️", tag: "settings" }
                            ]

                            Rectangle {
                                width: parent.width
                                height: 45
                                color: mouseArea.containsMouse ? themeColors.background : "transparent"
                                radius: themeRadius.small

                                Layout.fillWidth: true
                                Layout.topMargin: themeSpacing.xxs

                                Row {
                                    anchors.centerIn: parent
                                    spacing: themeSpacing.sm

                                    Text {
                                        text: modelData.icon
                                        font.pixelSize: themeFonts.large
                                    }

                                    Label {
                                        text: modelData.name
                                        font.pixelSize: themeFonts.medium
                                        color: themeColors.text
                                    }
                                }

                                MouseArea {
                                    id: mouseArea
                                    anchors.fill: parent
                                    hoverEnabled: true

                                    onClicked: {
                                        console.log("Clicked:", modelData.name)
                                        // TODO: Implement page navigation in step 3
                                    }
                                }
                            }
                        }

                        Item { Layout.fillHeight: true }

                        // Status footer
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: themeSpacing.xxs

                            Label {
                                text: qsTr("模式: ") + (app ? app.runMode : "local")
                                font.pixelSize: themeFonts.tiny
                                color: themeColors.textSecondary
                                Layout.alignment: Qt.AlignHCenter
                            }

                            Label {
                                text: qsTr("v") + (app ? app.appVersion : "1.0.0")
                                font.pixelSize: themeFonts.tiny
                                color: themeColors.textDisabled
                                Layout.alignment: Qt.AlignHCenter
                            }
                        }

                        Item { Layout.preferredHeight: themeSpacing.sm }
                    }
                }

                // Main content area
                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: themeColors.background

                    ScrollView {
                        anchors.fill: parent
                        anchors.margins: themeSpacing.xl

                        ColumnLayout {
                            width: parent.width
                            spacing: themeSpacing.lg

                            Label {
                                text: qsTr("欢迎使用 SecScore")
                                font.pixelSize: themeFonts.title
                                font.bold: true
                                color: themeColors.text
                                Layout.topMargin: themeSpacing.xl
                            }

                            Label {
                                text: qsTr("这是一个基于 Qt6/QML 开发的教育场景个人积分管理系统。")
                                        + "\n支持本地和远程（WebSocket）两种模式。"
                                        + "\n\n当前为最小可运行版本，更多功能正在逐步实现中..."
                                font.pixelSize: themeFonts.medium
                                color: themeColors.textSecondary
                                Layout.topMargin: themeSpacing.sm
                                lineLaidOut: Text.WordWrap
                            }

                            // Feature cards
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: themeSpacing.md
                                Layout.topMargin: themeSpacing.lg

                                Repeater {
                                    model: [
                                        { title: qsTr("学生管理"), desc: qsTr("添加、编辑、删除学生信息"), icon: "👥" },
                                        { title: qsTr("积分管理"), desc: qsTr("记录加减分，自动计算总分"), icon: "📊" },
                                        { title: qsTr("事件流水"), desc: qsTr("完整的历史记录追踪"), icon: "📝" }
                                    ]

                                    Rectangle {
                                        Layout.preferredWidth: 200
                                        Layout.preferredHeight: 150
                                        color: themeColors.card
                                        radius: themeRadius.medium
                                        border.color: themeColors.border
                                        border.width: 1

                                        ColumnLayout {
                                            anchors.centerIn: parent
                                            spacing: themeSpacing.sm

                                            Text {
                                                text: modelData.icon
                                                font.pixelSize: 48
                                                Layout.alignment: Qt.AlignHCenter
                                            }

                                            Label {
                                                text: modelData.title
                                                font.pixelSize: themeFonts.large
                                                font.bold: true
                                                color: themeColors.text
                                                Layout.alignment: Qt.AlignHCenter
                                            }

                                            Label {
                                                text: modelData.desc
                                                font.pixelSize: themeFonts.small
                                                color: themeColors.textSecondary
                                                horizontalAlignment: Text.AlignHCenter
                                                Layout.alignment: Qt.AlignHCenter
                                                Layout.fillWidth: true
                                                Layout.leftMargin: themeSpacing.sm
                                                Layout.rightMargin: themeSpacing.sm
                                                wrapMode: Text.WordWrap
                                            }
                                        }
                                    }
                                }
                            }

                            Item { Layout.fillHeight: true }
                        }
                    }
                }
            }
        }
    }
}
