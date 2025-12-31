import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import SecScore 1.0

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
            Item { Layout.fillWidth: true }
            Button {
                text: "添加学生"
                onClicked: addStudentDialog.open()
            }
        }
        
        ListView {
            id: listView
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: studentRepo.getAll()
            spacing: 8
            
            delegate: Rectangle {
                width: listView.width
                height: 60
                color: surfaceColor
                radius: currentRadius
                
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 12
                    
                    Label {
                        text: modelData.name
                        font.bold: true
                        Layout.fillWidth: true
                        color: textColor
                    }
                    
                    Label {
                        text: "积分: " + modelData.score
                        color: primaryColor
                        font.bold: true
                    }
                    
                    Button {
                        text: "编辑"
                        onClicked: {
                            editStudentDialog.studentId = modelData.id
                            editStudentDialog.studentName = modelData.name
                            editStudentDialog.open()
                        }
                    }
                    
                    Button {
                        text: "删除"
                        onClicked: {
                            if (confirmDeleteDialog.open()) {
                                studentRepo.remove(modelData.id)
                                refresh()
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
        Label { text: "确定要删除该学生吗？" }
        
        function open() {
            return exec() === Dialog.Yes
        }
    }
    
    Component.onCompleted: refresh()
}
