import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import SecScore 1.0
import "../components"

Item {
    id: root
    
    StudentRepo { id: studentRepo }
    
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: currentSpacing
        spacing: currentSpacing
        
        RowLayout {
            Layout.fillWidth: true
            Label {
                text: "学生列表"
                font.pixelSize: currentFontSize + 6
                font.bold: true
                color: textColor
            }
        }
        
        ListView {
            id: listView
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: studentRepo.getAll()
            spacing: 8
            
            footer: Item {
                width: listView.width
                height: 60
                ThemedButton {
                    anchors.centerIn: parent
                    text: "添加学生"
                    onClicked: addStudentDialog.open()
                }
            }

            delegate: Rectangle {
                width: listView.width
                height: 100
                color: surfaceColor
                radius: currentRadius
                
                ColumnLayout {
                    anchors.centerIn: parent
                    spacing: 12
                    
                    Label {
                        text: modelData.name
                        font.bold: true
                        Layout.alignment: Qt.AlignHCenter
                        color: textColor
                    }
                    
                    RowLayout {
                        Layout.alignment: Qt.AlignHCenter
                        spacing: 12

                        ThemedButton {
                            text: "编辑"
                            onClicked: {
                                editStudentDialog.studentId = modelData.id
                                editStudentDialog.studentName = modelData.name
                                editStudentDialog.open()
                            }
                        }
                        
                        ThemedButton {
                            text: "删除"
                            onClicked: {
                                confirmDeleteDialog.studentId = modelData.id
                                confirmDeleteDialog.open()
                            }
                        }
                    }
                }
            }
        }
    }
    
    function refresh() {
        listView.model = studentRepo.getAll()
    }
    
    Dialog {
        id: addStudentDialog
        title: "添加学生"
        anchors.centerIn: parent
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        
        ColumnLayout {
            spacing: 10
            TextField {
                id: newNameField
                placeholderText: "姓名"
                Layout.fillWidth: true
            }
        }
        
        onAccepted: {
            if (newNameField.text.trim() !== "") {
                studentRepo.create({"name": newNameField.text.trim(), "score": 0})
                newNameField.text = ""
                refresh()
            }
        }
    }
    
    Dialog {
        id: editStudentDialog
        property int studentId
        property alias studentName: editNameField.text
        title: "编辑学生"
        anchors.centerIn: parent
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        
        ColumnLayout {
            spacing: 10
            TextField {
                id: editNameField
                placeholderText: "姓名"
                Layout.fillWidth: true
            }
        }
        
        onAccepted: {
            if (editNameField.text.trim() !== "") {
                studentRepo.update(studentId, {"name": editNameField.text.trim()})
                refresh()
            }
        }
    }
    
    Dialog {
        id: confirmDeleteDialog
        title: "确认删除"
        anchors.centerIn: parent
        modal: true
        standardButtons: Dialog.Yes | Dialog.No
        property int studentId: -1
        width: 300
        
        ColumnLayout {
            spacing: 10
            Label { 
                text: "确定要删除该学生吗？"
                Layout.fillWidth: true
            }
        }
        
        onAccepted: {
            if (studentId !== -1) {
                studentRepo.remove(studentId)
                refresh()
            }
        }
    }
    
    Component.onCompleted: refresh()
}
