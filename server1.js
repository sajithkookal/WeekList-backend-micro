const express = require('express')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
const dotenv = require('dotenv')
const ejs = require('ejs')
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken");
dotenv.config();

const app = express();
const WeekList = require("./models/WeekList");
const User = require("./models/User");

const users = [];
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.set('view engine', 'ejs')

app.get("/health", (req, res) => {
    res.status(200).json({
        service: 'weeklist-backend server',
        status: 'active',
        time: new Date().toLocaleTimeString()
    })
})


app.get('/', (req, res) => {
    res.json({
        status: "Success",
        message: "All good"
    })
})

app.post("/signup", async (req, res) => {
    try {
        const { fullname, email, password, age, gender, mobile } = req.body;

        if (!fullname || !email || !password || !age || !gender || !mobile) {
            return res.status(400).json({ message: "Please provide all fields" });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email })
        // console.log("existingUser");
        //console.log(existingUser);
        if (existingUser) {
            return res.json({ message: "User already exists" });
        }
        console.log("existingUser2");
        const encryptedPassword = await bcrypt.hash(password, 10)
        const newUser = {
            fullname,
            email,
            password: encryptedPassword,
            age,
            gender,
            mobile,
        };

        await User.create(newUser)
        // User.push(newUser);

        const token = jwt.sign({ email: newUser.email }, process.env.JWT_KEY);
        res.json({
            status: 'SUCCESS',
            message: "You've signed up successfully",

        })
        //   res.status(201).json({ token });
    } catch (error) {
        res.json({
            message: error
        })
    }
});

//Login Route
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });

    if (user) {
        let isPasswordMatch = await bcrypt.compare(password, user.password)
        if (isPasswordMatch) {
            // Generate JWT token for authentication
            const token = jwt.sign({ email: user.email }, process.env.JWT_KEY);

            res.json({ token });
        } else {
            return res.json({ message: "Invalid Password" });
        }
    } else {
        return res.json({ message: "Invalid email or password" });
    }

});
// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const  jwToken  = req.header('Authorization');

    if (!jwToken) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    jwt.verify(jwToken, process.env.JWT_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ message: "Page Note Found" });
        }
        req.user = user;
        next();
    });
};

app.post("/weeklist", authenticateToken, async (req, res) => {
    const { userId, weekNumber, tasks } = req.body;

    try {
        // Logic to check the number of active week lists for the user
        const activeWeekListsCount = await WeekList.countDocuments({ userId });

        if (activeWeekListsCount >= 2) {
            return res
                .status(400)
                .json({ message: "Maximum number of active week lists reached" });
        }

        // Logic to ensure a user can only create a new week list after the previous ones have ended
        const latestWeekList = await WeekList.findOne({ userId }).sort({
            createdAt: -1,
        });

        if (
            latestWeekList &&
            Date.now() - latestWeekList.createdAt < 7 * 24 * 60 * 60 * 1000
        ) {
            return res
                .status(400)
                .json({ message: "Wait until the current week list ends" });
        }

        // Save the new week list to the database
        const newWeekList = await WeekList.create({ userId, weekNumber, tasks });
        res.status(201).json(newWeekList);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
app.put("/weeklist/:id", async (req, res) => {
    const { id } = req.params;
    const { tasks } = req.body;

    try {
        const weekList = await WeekList.findById(id);

        if (!weekList) {
            return res.status(404).json({ message: "Week list not found" });
        }

        const elapsedTime = Date.now() - weekList.createdAt;
        if (elapsedTime > 24 * 60 * 60 * 1000) {
            return res.status(400).json({ message: "Cannot update after 24 hours" });
        }

        // Perform the update (modify weekList.tasks, etc.)
         weekList.tasks = tasks;

        // Save the updated week list
        await weekList.save();

        res.status(200).json({ message: "Week list updated successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
app.delete("/weeklist/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const weekList = await WeekList.findById(id);

        if (!weekList) {
            return res.status(404).json({ message: "Week list not found" });
        }

        const elapsedTime = Date.now() - weekList.createdAt;
        if (elapsedTime > 24 * 60 * 60 * 1000) {
            return res.status(400).json({ message: "Cannot delete after 24 hours" });
        }

        // Perform the deletion
        await WeekList.findByIdAndDelete(id);

        res.status(200).json({ message: "Week list deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
app.post("/weeklist/:id/tasks/:taskId", async (req, res) => {
    const { id, taskId } = req.params;
    const { isCompleted } = req.body;

    try {
        const weekList = await WeekList.findById(id);

        if (!weekList) {
            return res.status(404).json({ message: "Week list not found" });
        }

        const taskToUpdate = weekList.tasks.id(taskId);

        if (!taskToUpdate) {
            return res.status(404).json({ message: "Task not found" });
        }

        taskToUpdate.completed = isCompleted;
        taskToUpdate.completedAt = isCompleted ? new Date() : null;

        await weekList.save();

        res.status(200).json({ message: "Task updated successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
app.get("/weeklists", async (req, res) => {
    try {
        const allWeekLists = await WeekList.find();

        const weekListsWithTimeLeft = allWeekLists.map((weekList) => {
            const elapsedTime = Date.now() - weekList.createdAt;
            const timeLeft =
                elapsedTime > 7 * 24 * 60 * 60 * 1000
                    ? 0
                    : 7 * 24 * 60 * 60 * 1000 - elapsedTime;

            return {
                _id: weekList._id,
                userId: weekList.userId,
                weekNumber: weekList.weekNumber,
                timeLeftToComplete: timeLeft,
            };
        });

        res.status(200).json(weekListsWithTimeLeft);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
app.get("/weeklist/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const weekList = await WeekList.findById(id);

        if (!weekList) {
            return res.status(404).json({ message: "Week list not found" });
        }

        res.status(200).json(weekList);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
app.get("/feed", async (req, res) => {
    try {
        const activeWeekLists = await WeekList.find({
            $or: [{ state: "active" }, { state: "completed" }],
        });

        res.status(200).json(activeWeekLists);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
const checkState = async (req, res, next) => {
    const { id } = req.params;

    try {
        const weekList = await WeekList.findById(id);

        if (!weekList) {
            return res.status(404).json({ message: "Week list not found" });
        }

        const elapsedTime = Date.now() - weekList.createdAt;

        if (elapsedTime > 24 * 60 * 60 * 1000 || weekList.state !== "active") {
            return res.status(403).json({ message: "Cannot modify the week list" });
        }

        next();
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};
app.post("/weeklist/:id/tasks/:taskId", checkState, async (req, res) => {
    const { id, taskId } = req.params;
    const { isCompleted } = req.body;

    try {
        const weekList = await WeekList.findById(id);

        if (!weekList) {
            return res.status(404).json({ message: "Week list not found" });
        }

        const elapsedTime = Date.now() - weekList.createdAt;

        if (elapsedTime > 24 * 60 * 60 * 1000 || weekList.state !== "active") {
            return res.status(403).json({ message: "Cannot modify the week list" });
        }

        const taskToUpdate = weekList.tasks.id(taskId);

        if (!taskToUpdate) {
            return res.status(404).json({ message: "Task not found" });
        }

        taskToUpdate.completed = isCompleted;
        taskToUpdate.completedAt = isCompleted ? new Date() : null;

        if (isCompleted) {
            weekList.state = "completed";
            weekList.locked = true;
        }

        await weekList.save();

        res.status(200).json({ message: "Task updated successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});


const PORT = process.env.PORT;
app.listen(PORT, () => {
    mongoose.connect(process.env.MONGODB_URL)
        .then(() => console.log("Server running"))
        .catch((error) => console.log(error))

})