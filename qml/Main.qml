import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: window
    width: 960
    height: 640
    visible: true
    title: qsTr("SecScore 积分软件")

    header: ToolBar {
        RowLayout {
            anchors.fill: parent
            ToolButton { text: qsTr("主页"); onClicked: tabs.currentIndex = 0 }
            Label {
                text: qsTr("基本框架（Fluent/Universal 风格）")
                horizontalAlignment: Text.AlignHCenter
                Layout.fillWidth: true
            }
            Button { text: qsTr("关于") }
        }
    }

    TabView {
        id: tabs
        anchors.fill: parent

        Tab {
            title: qsTr("会员")
            Rectangle { anchors.fill: parent; color: "transparent"
                ColumnLayout {
                    anchors.margins: 24
                    anchors.fill: parent
                    spacing: 12

                    GroupBox {
                        title: qsTr("创建新会员")
                        Layout.fillWidth: true
                        RowLayout {
                            anchors.margins: 12
                            anchors.fill: parent
                            TextField { id: nameField; placeholderText: qsTr("会员名称"); Layout.fillWidth: true }
                            Button { text: qsTr("创建"); onClicked: {
                                    const id = scoreService.createMember(nameField.text)
                                    createdId.text = id > 0 ? qsTr("已创建，ID: %1").arg(id) : qsTr("创建失败")
                                }
                            }
                        }
                        Label { id: createdId; anchors.left: parent.left; anchors.leftMargin: 12; anchors.bottom: parent.bottom; anchors.bottomMargin: 12 }
                    }

                    GroupBox {
                        title: qsTr("积分查询/变更")
                        Layout.fillWidth: true
                        RowLayout {
                            anchors.margins: 12
                            anchors.fill: parent
                            SpinBox { id: idField; from: 1; to: 999999; value: 1 }
                            Label { text: qsTr("当前积分: %1").arg(scoreService.pointsFor(idField.value)) }
                            SpinBox { id: deltaField; from: 1; to: 100000; value: 10 }
                            Button { text: qsTr("增加"); onClicked: scoreService.addPoints(idField.value, deltaField.value) }
                            Button { text: qsTr("扣减"); onClicked: scoreService.deductPoints(idField.value, deltaField.value) }
                        }
                    }
                }
            }
        }

        Tab {
            title: qsTr("流水")
            Rectangle { anchors.fill: parent; color: "transparent"
                Label { anchors.centerIn: parent; text: qsTr("后续实现：积分流水列表") }
            }
        }
    }
}

